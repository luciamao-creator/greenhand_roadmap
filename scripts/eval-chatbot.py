#!/usr/bin/env python3
"""
scripts/eval-chatbot.py —— 阶段 3 chatbot 离线评测执行器

读分层 golden set（默认 data/eval/chatbot-golden.jsonl），逐条打 /api/chat，
用确定性规则算指标，输出 JSON + Markdown 报告到 data/eval/reports/。

设计原则：
- 默认纯确定性判定，保证 CI 可跑、可复现、结果可归因；
  「忠实度/有用性」等主观指标由 --judge 开启 LLM 裁判（复用 chat 服务的 OpenAI 兼容通道）。
- 指标直接对应产品承诺：不编造（citation/id leak）、记得上下文（mode/focus）、
  推荐契合（recommend hit）、该说不知道就说（uncovered / no_recommendation）。
- 检索层加权：对 L3 推荐用例额外计算 MRR / Hit@k / NDCG，并区分「终排（含 LLM 重排）」
  与「纯检索 NDCG（按 raw score）」两套，后者用于暴露向量检索本身的排序质量，
  不被生成侧重排掩盖；最终并入「质量综合分」。
- 指标也保留工程口径：错误率、检索/生成分位耗时、token 成本。

用法：
  python3 scripts/eval-chatbot.py                       # 全量（确定性）
  python3 scripts/eval-chatbot.py --judge               # 全量 + LLM 裁判（主观质量）
  python3 scripts/eval-chatbot.py --layer L2            # 只跑多轮指代层
  python3 scripts/eval-chatbot.py --limit 5 --verbose
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_GOLDEN = ROOT / "data" / "eval" / "chatbot-golden.jsonl"
DEFAULT_INDEX = ROOT / "data" / "rag" / "route-index.json"
REPORT_DIR = ROOT / "data" / "eval" / "reports"

# 当知识库无匹配时，回答里出现这些词视为「如实说明了没有」
NO_MATCH_PHRASES = ["没有", "未收录", "暂无", "暂时", "换个", "无相关", "不包含", "无法推荐"]

# 明显「库外信息」的免责声明词
UNCOVERED_PHRASES = ["资料未覆盖", "未覆盖", "建议出发前确认", "建议提前确认"]


# --------------------------------------------------------------------------- #
# .env 加载（让评测脚本复用与 chat 服务相同的 LLM 密钥）
# --------------------------------------------------------------------------- #
def load_dotenv_local() -> None:
    """若操作系统未设置，则从仓库根 .env / .env.local 读取 LLM 相关变量（不覆盖已有值）。
    Next 默认读取 .env.local，故评测脚本也加载它，才能复用与 chat 服务相同的 LLM 密钥。"""
    for name in (".env.local", ".env"):
        env_path = ROOT / name
        if not env_path.exists():
            continue
        for raw in env_path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key, value = key.strip(), value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


# --------------------------------------------------------------------------- #
# 检索层指标（独立于 LLM 重排，暴露纯向量检索质量）
# --------------------------------------------------------------------------- #
def _dcg(rel: list[float]) -> float:
    return sum(r / math.log2(i + 2) for i, r in enumerate(rel))


def retrieval_metrics(source_items: list[dict], expected_names: set[str]) -> dict | None:
    """source_items: 含 route_name / score 的 sources；expected_names: 相关线路名集合。
    同时给出「终排」（sources 顺序，含 LLM 重排）与「纯检索层」（按 raw score 排序）两套指标，
    后者用于暴露向量检索本身的排序质量，不被生成侧重排掩盖。"""
    if not expected_names:
        return None
    names = [s.get("route_name") for s in source_items]
    final_rel = [1.0 if n in expected_names else 0.0 for n in names]
    ideal = sorted(final_rel, reverse=True)
    final_ndcg = _dcg(final_rel) / _dcg(ideal) if any(final_rel) else 0.0

    ordered = sorted(source_items, key=lambda s: float(s.get("score") or 0.0), reverse=True)
    raw_rel = [1.0 if s.get("route_name") in expected_names else 0.0 for s in ordered]
    raw_ndcg = _dcg(raw_rel) / _dcg(sorted(raw_rel, reverse=True)) if any(raw_rel) else 0.0

    mrr = 0.0
    for i, n in enumerate(names, 1):
        if n in expected_names:
            mrr = 1.0 / i
            break
    ranks = [i + 1 for i, n in enumerate(names) if n in expected_names]
    return {
        "final_ndcg": round(final_ndcg, 4),
        "raw_ndcg": round(raw_ndcg, 4),
        "mrr": round(mrr, 4),
        "hit1": 1.0 if any(n in expected_names for n in names[:1]) else 0.0,
        "hit3": 1.0 if any(n in expected_names for n in names[:3]) else 0.0,
        "hit5": 1.0 if any(n in expected_names for n in names[:5]) else 0.0,
        "expected_rank": min(ranks) if ranks else None,
        "expected_in_sources": bool(ranks),
    }


# --------------------------------------------------------------------------- #
# LLM 裁判（可选，--judge 开启；复用 chat 服务的 OpenAI 兼容通道）
# --------------------------------------------------------------------------- #
JUDGE_DIMS = ["helpfulness", "beginner_clarity", "faithfulness", "mode_fit", "tone"]

JUDGE_SYSTEM = (
    "你是一名严格的徒步路线推荐助手质检员。只依据给定资料判断，不脑补。"
    "输出严格 JSON，不要 markdown 代码块。"
    "faithfulness 只评价「事实是否忠于给定资料」，不要因为模式契合度或是否命中标注清单而扣分（那是 mode_fit 的维度）。"
)

JUDGE_USER = """请基于【用户问题】【系统应遵守的约束】【检索到的资料】【助手回答】四项，对助手回答打分。

打分维度（每项 0-5 的整数，5 最佳）：
- helpfulness：是否真正解决了用户问题、给出可行动建议。
- beginner_clarity：对零基础新手是否易懂、不堆术语。
- faithfulness：是否严格基于检索资料，没有编造资料外的数据或定性事实（如门票、天气、距离数值、看海/瀑布/红叶等景观、资料未出现的景点地标名）。注意：只因「推荐的线路不在标注清单里」不算 faithfulness 失分。
- mode_fit：回答形态（单线路聚焦 vs 多线路推荐）是否符合问题意图，以及推荐是否合理（如同城、契合需求、基于资料）。
- tone：中文是否自然亲切，不像机器生成。

约束（仅供判断 faithfulness/mode_fit，不参与加分）：
{mode_line}{constraints_line}
检索到的资料（仅这些可作为事实依据）：
{sources_text}

用户问题：{query}
多轮上文：{history_text}

助手回答：
{answer}

只输出 JSON：{{"helpfulness":0,"beginner_clarity":0,"faithfulness":0,"mode_fit":0,"tone":0,"rationale":"一句话总评"}}"""


def _card_facts(card: dict) -> str:
    """把 route_card 的关键数值/属性压成一行，供裁判判定「是否编造」。
    聚焦模式下 API 返回的 sources 只含命中 chunk，但生成时用了整张卡片，
    裁判必须看到同样的上下文才公平。"""
    if not isinstance(card, dict):
        return ""
    parts = [
        card.get("province_name", ""),
        card.get("city_name", ""),
        card.get("area_name", ""),
        card.get("route_type_label", ""),
        card.get("difficulty_label", ""),
    ]
    if card.get("distance_km") is not None:
        parts.append(f"约{card['distance_km']}km")
    if card.get("duration_hours") is not None:
        parts.append(f"约{card['duration_hours']}小时")
    if card.get("ascent_m") is not None:
        parts.append(f"爬升约{card['ascent_m']}m")
    if card.get("surface_tags"):
        parts.append("路面：" + "/".join(card["surface_tags"]))
    if card.get("season_tags"):
        parts.append("适宜季节：" + "/".join(card["season_tags"]))
    if card.get("summary_short"):
        parts.append("简介：" + card["summary_short"])
    if card.get("start_point_name"):
        parts.append("起点：" + card["start_point_name"])
    if card.get("end_point_name"):
        parts.append("终点：" + card["end_point_name"])
    return " | ".join(p for p in parts if p)


def build_judge_messages(case: dict, data: dict) -> list[dict]:
    expected = case.get("expect") or {}
    mode_line = f"期望模式：{expected['mode']}\n" if expected.get("mode") else ""
    constraints: list[str] = []
    if expected.get("must_recommend_any_of"):
        constraints.append(
            "标注方参考清单（非强制）：认为合适的线路 — "
            + " / ".join(expected["must_recommend_any_of"])
            + "。模型可推荐同城/更契合的替代线路，只要基于资料且说明理由，不要仅因未命中此清单而扣 mode_fit。"
        )
    if expected.get("forbid_recommend"):
        constraints.append("不应推荐：" + " / ".join(expected["forbid_recommend"]))
    if expected.get("must_say_any"):
        constraints.append("应提及（如资料未覆盖）：" + " / ".join(expected["must_say_any"]))
    if expected.get("no_recommendation"):
        constraints.append("应如实说明无匹配，不得虚构线路")
    constraints_line = ("约束：\n" + "\n".join(f"  - {c}" for c in constraints) + "\n") if constraints else ""
    sources = data.get("sources") or []
    src_lines = []
    for s in sources[:5]:
        matched = (s.get("matched_text") or "")[:120]
        card = _card_facts(s.get("route_card") or {})
        line = f"  · {s.get('route_name')}（{s.get('matched_chunk_label','')}）：{matched}"
        if card:
            line += f"\n    线路全量属性：{card}"
        src_lines.append(line)
    sources_text = "\n".join(src_lines) or "  （无）"
    history = case.get("history") or []
    history_text = "\n".join(f"  {h['role']}: {h['content']}" for h in history) or "（无）"
    user = JUDGE_USER.format(
        mode_line=mode_line,
        constraints_line=constraints_line,
        sources_text=sources_text,
        query=case["query"],
        history_text=history_text,
        answer=data.get("answer") or "",
    )
    return [
        {"role": "system", "content": JUDGE_SYSTEM},
        {"role": "user", "content": user},
    ]


def call_judge(cfg: dict, case: dict, data: dict, timeout: float) -> dict | None:
    if not cfg.get("api_key") or not cfg.get("api_url"):
        return None
    messages = build_judge_messages(case, data)
    body = {"model": cfg["model"], "messages": messages, "temperature": 0}
    # AGENT_PREFILL_API_URL 已是完整 /chat/completions 端点；若传入的是 base 则补齐
    url = cfg["api_url"].rstrip("/")
    if not url.endswith("/chat/completions"):
        url = url + "/chat/completions"
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {cfg['api_key']}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        content = payload["choices"][0]["message"]["content"]
        parsed = json.loads(content)
    except Exception as exc:  # noqa: BLE001 - 裁判失败不应中断整轮评测
        return {"error": f"{type(exc).__name__}: {exc}"}
    scores: dict = {}
    for dim in JUDGE_DIMS:
        v = parsed.get(dim)
        if isinstance(v, (int, float)):
            scores[dim] = max(0, min(5, int(round(v))))
    scores["rationale"] = str(parsed.get("rationale", ""))[:200]
    return scores



def pctl(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    k = max(0, min(len(ordered) - 1, int(round((p / 100.0) * (len(ordered) - 1)))))
    return ordered[k]


def load_routes(index_path: Path) -> tuple[list[str], dict[str, str]]:
    """返回 (全部线路名列表, route_id → 线路名)"""
    if not index_path.exists():
        return [], {}
    data = json.loads(index_path.read_text(encoding="utf-8"))
    id_to_name: dict[str, str] = {}
    for rid, card in data.get("route_cards", {}).items():
        name = card.get("route_name")
        if name:
            id_to_name[rid] = name
    return list(id_to_name.values()), id_to_name


def load_golden(path: Path, layer: str | None, limit: int | None) -> list[dict]:
    cases: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        cases.append(json.loads(line))
    if layer:
        cases = [c for c in cases if c.get("layer") == layer]
    if limit:
        cases = cases[:limit]
    return cases


def call_chat(base_url: str, case: dict, timeout: float) -> tuple[dict | None, str | None]:
    body: dict = {"query": case["query"], "topK": 5}
    if case.get("history"):
        body["history"] = case["history"]
    if case.get("carried_focus_route_id"):
        body["focusRouteId"] = case["carried_focus_route_id"]
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/api/chat",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        return payload.get("data"), None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "ignore")[:200]
        return None, f"HTTP {exc.code}: {detail}"
    except Exception as exc:  # noqa: BLE001 - 评测脚本需吞掉各类网络异常
        return None, f"{type(exc).__name__}: {exc}"


def evaluate_case(case: dict, data: dict, all_route_names: list[str]) -> dict:
    expect = case.get("expect") or {}
    answer = data.get("answer") or ""
    sources = data.get("sources") or []
    source_names = {s.get("route_name") for s in sources}
    recommended = [s.get("route_name") for s in sources if s.get("recommended")]

    # 检索层指标：相关线路集合来自 golden 的 must_recommend_any_of
    expected_names = set(expect.get("must_recommend_any_of") or [])
    retrieval = retrieval_metrics(sources, expected_names) if expected_names else None

    checks: dict[str, bool] = {}

    if expect.get("mode"):
        checks["mode_ok"] = data.get("mode") == expect["mode"]
    if expect.get("focus_route_id"):
        checks["focus_ok"] = data.get("focus_route_id") == expect["focus_route_id"]
    if expect.get("must_recommend_any_of"):
        checks["recommend_hit_ok"] = bool(set(expect["must_recommend_any_of"]) & set(recommended))
    if expect.get("forbid_recommend"):
        checks["forbid_ok"] = not (set(expect["forbid_recommend"]) & set(recommended))
    if expect.get("must_say_any"):
        checks["must_say_ok"] = any(p in answer for p in expect["must_say_any"])
    if expect.get("no_recommendation"):
        checks["no_recommendation_ok"] = (len(recommended) == 0) or any(
            p in answer for p in NO_MATCH_PHRASES
        )
    if expect.get("must_not_regex"):
        checks["must_not_regex_ok"] = not any(re.search(p, answer) for p in expect["must_not_regex"])

    # 全局护栏（所有用例都算）：答案提到但不在溯源里的线路 = 编造/越界引用
    mentioned = {name for name in all_route_names if name in answer}
    citation_violation = sorted(mentioned - source_names)
    id_leak = bool(re.search(r"rt_[0-9a-f]{6,}", answer))

    # 兜底护栏（所有用例都算）：命中服务端写死的兜底文案（澄清/库外城市/库外实体/范围无线路）时，
    # 若该用例并不期望「无推荐」，说明真实意图被短路了（典型：上一轮库外实体污染本轮新问题），
    # 必须判失败——兜底文案的 mode 也是 recommend，只断言 mode 的用例会「假通过」。
    # 优先读协议字段 fallback_reason（服务端显式声明）；旧服务不返回该字段时退回「metrics 全 0」启发式。
    metrics = data.get("metrics") or {}
    tokens = (metrics.get("prompt_tokens") or 0) + (metrics.get("completion_tokens") or 0)
    fallback_reason = data.get("fallback_reason")
    static_fallback = bool(fallback_reason) or (
        fallback_reason is None
        and (metrics.get("retrieve_ms") or 0) == 0
        and (metrics.get("answer_ms") or 0) == 0
        and tokens == 0
    )
    static_fallback_violation = static_fallback and not expect.get("no_recommendation")
    if static_fallback_violation:
        checks["no_static_fallback_ok"] = False

    return {
        "id": case["id"],
        "layer": case.get("layer"),
        "intent": case.get("intent"),
        "query": case["query"],
        "review": bool(case.get("review")),
        "mode": data.get("mode"),
        "expect_mode": expect.get("mode"),
        "focus_route_id": data.get("focus_route_id"),
        "expect_focus_route_id": expect.get("focus_route_id"),
        "recommended": recommended,
        "retrieval": retrieval,
        "sources": sorted(n for n in source_names if n),
        "answer": answer,
        "checks": checks,
        "passed": all(checks.values()) if checks else True,
        "citation_violation": citation_violation,
        "id_leak": id_leak,
        "static_fallback": static_fallback_violation,
        "fallback_reason": fallback_reason,
        "must_say_hit": any(p in answer for p in UNCOVERED_PHRASES) if expect.get("must_say_any") else None,
        "latency": {
            "retrieve_ms": metrics.get("retrieve_ms"),
            "answer_ms": metrics.get("answer_ms"),
            "tokens": (metrics.get("prompt_tokens") or 0) + (metrics.get("completion_tokens") or 0),
        },
    }


def summarize(results: list[dict]) -> dict:
    graded = [r for r in results if not r.get("error")]
    scorable = [r for r in graded if not r["review"]]

    def rate(numer: int, denom: int) -> float:
        return round(numer / denom, 4) if denom else 0.0

    def check_rate(key: str) -> tuple[float, int]:
        rows = [r for r in scorable if key in r["checks"]]
        return rate(sum(1 for r in rows if r["checks"][key]), len(rows)), len(rows)

    mode_acc, mode_n = check_rate("mode_ok")
    focus_acc, focus_n = check_rate("focus_ok")
    rec_hit, rec_n = check_rate("recommend_hit_ok")
    forbid_viol, forbid_n = check_rate("forbid_ok")
    must_say, must_say_n = check_rate("must_say_ok")
    no_rec, no_rec_n = check_rate("no_recommendation_ok")

    # 检索层（仅 L3 推荐类用例，暴露纯向量检索质量）
    rec_cases = [r for r in scorable if r.get("retrieval")]
    rec_n_retrieval = len(rec_cases)

    def _mean_metric(key: str) -> float:
        vals = [r["retrieval"][key] for r in rec_cases if r["retrieval"].get(key) is not None]
        return round(sum(vals) / len(vals), 4) if vals else 0.0

    retrieval_mrr = _mean_metric("mrr")
    retrieval_hit1 = _mean_metric("hit1")
    retrieval_hit3 = _mean_metric("hit3")
    retrieval_hit5 = _mean_metric("hit5")
    retrieval_final_ndcg = _mean_metric("final_ndcg")
    retrieval_raw_ndcg = _mean_metric("raw_ndcg")
    retrieval_recall = rate(
        sum(1 for r in rec_cases if r["retrieval"].get("expected_in_sources")), rec_n_retrieval
    )

    # LLM 裁判均值（若开启）
    judged = [r for r in scorable if isinstance(r.get("judge"), dict) and "error" not in r["judge"]]
    judge_scores: dict = {}
    for dim in JUDGE_DIMS:
        vals = [r["judge"][dim] for r in judged if isinstance(r["judge"].get(dim), int)]
        judge_scores[dim] = round(sum(vals) / len(vals), 2) if vals else None

    # 质量综合分：行为(确定性) + 检索(纯向量) + 裁判(主观) 加权
    def _judge_norm(r: dict) -> float | None:
        j = r.get("judge")
        if not isinstance(j, dict) or "error" in j:
            return None
        vals = [v for k, v in j.items() if k in JUDGE_DIMS]
        return sum(vals) / len(vals) / 5.0 if vals else None

    def _composite(r: dict) -> float:
        behavior = 1.0 if r.get("passed") else 0.0
        jn = _judge_norm(r)
        retr = r.get("retrieval", {}).get("raw_ndcg") if r.get("retrieval") else None
        if jn is not None and retr is not None:
            return 0.25 * behavior + 0.35 * retr + 0.40 * jn
        if jn is not None and retr is None:
            return 0.5 * behavior + 0.5 * jn
        if jn is None and retr is not None:
            return 0.4 * behavior + 0.6 * retr
        return behavior

    quality_weighted = round(sum(_composite(r) for r in scorable) / len(scorable), 4) if scorable else 0.0

    retrieve_ms = [r["latency"]["retrieve_ms"] for r in graded if r["latency"]["retrieve_ms"] is not None]
    answer_ms = [r["latency"]["answer_ms"] for r in graded if r["latency"]["answer_ms"] is not None]
    tokens = [r["latency"]["tokens"] for r in graded]

    return {
        "cases_total": len(results),
        "cases_graded": len(graded),
        "cases_scorable": len(scorable),
        "errors": len(results) - len(graded),
        "error_rate": rate(len(results) - len(graded), len(results)),
        "pass_rate": rate(sum(1 for r in scorable if r["passed"]), len(scorable)),
        # 产品口径
        "mode_accuracy": mode_acc,
        "mode_cases": mode_n,
        "focus_accuracy": focus_acc,
        "focus_cases": focus_n,
        "recommend_hit_rate": rec_hit,
        "recommend_cases": rec_n,
        "forbid_compliance_rate": forbid_viol,
        "forbid_cases": forbid_n,
        "uncovered_handling_rate": must_say,
        "uncovered_cases": must_say_n,
        "no_recommendation_rate": no_rec,
        "no_recommendation_cases": no_rec_n,
        # 护栏口径
        "citation_violation_rate": rate(sum(1 for r in graded if r["citation_violation"]), len(graded)),
        "citation_violation_cases": [r["id"] for r in graded if r["citation_violation"]],
        "id_leak_rate": rate(sum(1 for r in graded if r["id_leak"]), len(graded)),
        "id_leak_cases": [r["id"] for r in graded if r["id_leak"]],
        "static_fallback_rate": rate(sum(1 for r in graded if r.get("static_fallback")), len(graded)),
        "static_fallback_cases": [r["id"] for r in graded if r.get("static_fallback")],
        # 静默降级分布：按服务端返回的 fallback_reason 计数，回答「用户被兜底了多少次、为什么」
        "fallback_reason_counts": {
            reason: sum(1 for r in graded if r.get("fallback_reason") == reason)
            for reason in sorted(
                {r.get("fallback_reason") for r in graded if r.get("fallback_reason")}
            )
        },
        # 工程口径
        "retrieve_p50_ms": pctl([float(v) for v in retrieve_ms], 50),
        "retrieve_p95_ms": pctl([float(v) for v in retrieve_ms], 95),
        "answer_p50_ms": pctl([float(v) for v in answer_ms], 50),
        "answer_p95_ms": pctl([float(v) for v in answer_ms], 95),
        "avg_tokens": round(sum(tokens) / len(tokens), 1) if tokens else 0.0,
        # 检索层口径（纯向量检索质量，不被 LLM 重排掩盖）
        "retrieval_mrr": retrieval_mrr,
        "retrieval_hit1": retrieval_hit1,
        "retrieval_hit3": retrieval_hit3,
        "retrieval_hit5": retrieval_hit5,
        "retrieval_final_ndcg": retrieval_final_ndcg,
        "retrieval_raw_ndcg": retrieval_raw_ndcg,
        "retrieval_recall": retrieval_recall,
        "retrieval_cases": rec_n_retrieval,
        # LLM 裁判口径（主观质量，0-5）
        "judge_scores": judge_scores,
        "judge_cases": len(judged),
        # 综合加权分（行为 + 检索 + 裁判）
        "quality_weighted": quality_weighted,
    }


def to_markdown(summary: dict, results: list[dict], label: str) -> str:
    def fmt(value: float, denom: int) -> str:
        # 分母为 0 时展示「—」而非 0.0%，避免看起来像指标挂了
        return f"{value:.1%}" if denom else "—"

    lines = [
        f"# chatbot 评测报告 · {label}",
        "",
        "## 总览",
        "",
        "| 指标 | 值 | 用例数 |",
        "| --- | --- | --- |",
        f"| 用例通过率 | {fmt(summary['pass_rate'], summary['cases_scorable'])} | {summary['cases_scorable']} |",
        f"| 模式判定准确率 (focus/recommend) | {fmt(summary['mode_accuracy'], summary['mode_cases'])} | {summary['mode_cases']} |",
        f"| 聚焦线路命中率 | {fmt(summary['focus_accuracy'], summary['focus_cases'])} | {summary['focus_cases']} |",
        f"| 推荐期望命中率 | {fmt(summary['recommend_hit_rate'], summary['recommend_cases'])} | {summary['recommend_cases']} |",
        f"| 禁止项合规率 | {fmt(summary['forbid_compliance_rate'], summary['forbid_cases'])} | {summary['forbid_cases']} |",
        f"| 库外信息处理率 | {fmt(summary['uncovered_handling_rate'], summary['uncovered_cases'])} | {summary['uncovered_cases']} |",
        f"| 无匹配如实说明率 | {fmt(summary['no_recommendation_rate'], summary['no_recommendation_cases'])} | {summary['no_recommendation_cases']} |",
        f"| 引用越界率（幻觉护栏） | {fmt(summary['citation_violation_rate'], summary['cases_graded'])} | {summary['cases_graded']} |",
        f"| 内部 id 泄漏率 | {fmt(summary['id_leak_rate'], summary['cases_graded'])} | {summary['cases_graded']} |",
        f"| 意图被静态兜底短路率（应推荐却拿到写死文案） | {fmt(summary['static_fallback_rate'], summary['cases_graded'])} | {summary['cases_graded']} |",
        f"| 走兜底文案的用例数（静默降级，按原因见下） | {sum(summary['fallback_reason_counts'].values())} | {summary['cases_graded']} |",
        (
            "| 兜底原因分布 | "
            + ("、".join(f"{k}: {v}" for k, v in summary["fallback_reason_counts"].items()) or "—")
            + " | — |"
        ),
        f"| 请求错误率 | {fmt(summary['error_rate'], summary['cases_total'])} | {summary['cases_total']} |",
        f"| **质量综合分**（行为+检索+裁判加权） | {fmt(summary['quality_weighted'], 1)} | {summary['cases_scorable']} |",
        "",
        "## 工程口径",
        "",
        "| 指标 | 值 |",
        "| --- | --- |",
        f"| 检索 P50 / P95 | {summary['retrieve_p50_ms']:.0f} / {summary['retrieve_p95_ms']:.0f} ms |",
        f"| 生成 P50 / P95 | {summary['answer_p50_ms']:.0f} / {summary['answer_p95_ms']:.0f} ms |",
        f"| 平均 token/次 | {summary['avg_tokens']} |",
        "",
        "## 检索层质量（纯向量检索，不被 LLM 重排掩盖）",
        "",
        "| 指标 | 值 | 用例数 |",
        "| --- | --- | --- |",
        f"| 检索 MRR | {summary['retrieval_mrr']:.3f} | {summary['retrieval_cases']} |",
        f"| Hit@1 / @3 / @5 | {fmt(summary['retrieval_hit1'], 1)} / {fmt(summary['retrieval_hit3'], 1)} / {fmt(summary['retrieval_hit5'], 1)} | {summary['retrieval_cases']} |",
        f"| 相关线路进入候选率 | {fmt(summary['retrieval_recall'], 1)} | {summary['retrieval_cases']} |",
        f"| 终排 NDCG（含 LLM 重排） | {summary['retrieval_final_ndcg']:.3f} | {summary['retrieval_cases']} |",
        f"| **纯检索 NDCG**（按 raw score，暴露真实检索质量） | {summary['retrieval_raw_ndcg']:.3f} | {summary['retrieval_cases']} |",
        "",
        "## LLM 裁判（主观质量，0-5；未开启 --judge 时无此节）",
        "",
        "| 维度 | 均值 |",
        "| --- | --- |",
        f"| helpfulness（有用性） | {summary['judge_scores'].get('helpfulness', '—')} |",
        f"| beginner_clarity（新手易懂） | {summary['judge_scores'].get('beginner_clarity', '—')} |",
        f"| faithfulness（忠实不编造） | {summary['judge_scores'].get('faithfulness', '—')} |",
        f"| mode_fit（模式契合） | {summary['judge_scores'].get('mode_fit', '—')} |",
        f"| tone（自然度） | {summary['judge_scores'].get('tone', '—')} |",
        f"| 裁判覆盖用例 | {summary['judge_cases']} |",
        "",
        "## 分层明细",
        "",
        "| 用例 | 层 | 模式 | 期望 | 聚焦 | 推荐 | 结果 |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in results:
        if r.get("error"):
            lines.append(f"| {r['id']} | {r['layer']} | - | - | - | - | ❌ {str(r['error'])[:60]} |")
            continue
        expect_mode = r.get("expect_mode") or "-"
        focus_exp = "✓" if r.get("expect_focus_route_id") else "-"
        focus_got = r.get("focus_route_id")
        focus_cell = f"{focus_got or '-'}"
        rec = ",".join(r["recommended"][:2]) or "-"
        ok = "✅" if r["passed"] else ("🔸待复核" if r["review"] else "❌")
        lines.append(
            f"| {r['id']} | {r['layer']} | {r['mode']} | {expect_mode} | {focus_cell} | {rec} | {ok} |"
        )

    failed = [r for r in results if not r.get("error") and not r["passed"] and not r["review"]]
    if failed:
        lines += ["", "## 未通过用例", ""]
        for r in failed:
            bad = [k for k, v in r["checks"].items() if not v]
            lines.append(f"- **{r['id']}** `{r['query']}` → 失败检查：{bad}")
            lines.append(f"  - 模式 `{r['mode']}` / 推荐 `{r['recommended']}`")
            lines.append(f"  - 回答：{r['answer'][:150]}")
    if summary["citation_violation_cases"]:
        lines += ["", "## 引用越界用例（答案提到溯源外线路）", ""]
        for r in results:
            if not r.get("error") and r["citation_violation"]:
                lines.append(f"- **{r['id']}** `{r['query']}` → 越界：{r['citation_violation']}")
    if summary["static_fallback_cases"]:
        lines += ["", "## 意图被静态兜底短路的用例（应走检索/生成却返回写死文案）", ""]
        for r in results:
            if not r.get("error") and r.get("static_fallback"):
                lines.append(f"- **{r['id']}** `{r['query']}` → 回答：{r['answer'][:100]}")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.environ.get("CHAT_BASE_URL", "http://localhost:3001"))
    parser.add_argument("--golden", default=str(DEFAULT_GOLDEN))
    parser.add_argument("--index", default=str(DEFAULT_INDEX))
    parser.add_argument("--layer", default=None, help="只跑某一层，如 L2")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--timeout", type=float, default=120.0)
    parser.add_argument("--out", default=None)
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--judge", action="store_true", help="开启 LLM 裁判（主观质量评分，需 LLM 密钥）")
    parser.add_argument("--judge-model", default=None, help="裁判模型，默认取 AGENT_PREFILL_MODEL")
    parser.add_argument("--judge-url", default=None, help="裁判端点，默认取 AGENT_PREFILL_API_URL")
    parser.add_argument("--judge-key", default=None, help="裁判密钥，默认取 AGENT_PREFILL_API_KEY")
    parser.add_argument(
        "--gate",
        action="store_true",
        help="CI 门禁：行为通过率<100% 或（开启 --judge 时）faithfulness 均值<阈值则退出码 1",
    )
    parser.add_argument("--gate-faith", type=float, default=4.0, help="门禁 faithfulness 阈值，默认 4.0")
    args = parser.parse_args()

    load_dotenv_local()
    all_route_names, _ = load_routes(Path(args.index))
    cases = load_golden(Path(args.golden), args.layer, args.limit)
    if not cases:
        print("没有可跑的用例", file=sys.stderr)
        return 1

    # 构建 LLM 裁判配置（复用 chat 服务的 OpenAI 兼容通道）
    judge_cfg: dict | None = None
    if args.judge:
        api_key = args.judge_key or os.environ.get("AGENT_PREFILL_API_KEY")
        api_url = args.judge_url or os.environ.get("AGENT_PREFILL_API_URL")
        model = args.judge_model or os.environ.get("AGENT_PREFILL_MODEL") or "qwen-plus"
        if not api_key or not api_url:
            print("⚠️ --judge 已开启但缺少 LLM 密钥/地址（AGENT_PREFILL_API_KEY / AGENT_PREFILL_API_URL），跳过裁判", file=sys.stderr)
        else:
            judge_cfg = {"api_key": api_key, "api_url": api_url, "model": model}
            print(f"LLM 裁判已开启：{model} @ {api_url}\n")

    print(f"评测集 {len(cases)} 条 · 目标 {args.base_url} · 知识库线路 {len(all_route_names)} 条\n")
    results: list[dict] = []
    for i, case in enumerate(cases, 1):
        started = time.time()
        data, err = call_chat(args.base_url, case, args.timeout)
        if err or data is None:
            results.append({"id": case["id"], "layer": case.get("layer"), "error": err or "empty"})
            print(f"  [{i}/{len(cases)}] {case['id']} ❌ {err}")
            continue
        row = evaluate_case(case, data, all_route_names)
        if judge_cfg:
            judge = call_judge(judge_cfg, case, data, args.timeout)
            if judge is not None:
                row["judge"] = judge
                if "error" in judge:
                    print(f"        ⚠️ 裁判失败：{judge['error'][:60]}")
        row["elapsed_s"] = round(time.time() - started, 1)
        results.append(row)
        mark = "✅" if row["passed"] else ("🔸" if row["review"] else "❌")
        if args.verbose:
            print(f"  [{i}/{len(cases)}] {case['id']} {mark} mode={row['mode']} rec={row['recommended'][:2]}")
            print(f"        Q: {case['query']}")
            print(f"        A: {row['answer'][:160]}")
        else:
            print(f"  [{i}/{len(cases)}] {case['id']} {mark} ({row['elapsed_s']}s)")

    summary = summarize(results)
    label = datetime.now().strftime("%Y-%m-%d %H:%M")
    markdown = to_markdown(summary, results, label)

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    json_path = Path(args.out) if args.out else REPORT_DIR / f"eval-chatbot-{stamp}.json"
    md_path = json_path.with_suffix(".md")
    json_path.write_text(
        json.dumps({"label": label, "summary": summary, "results": results}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    md_path.write_text(markdown, encoding="utf-8")

    print("\n" + "=" * 72)
    print(markdown.split("## 分层明细")[0])
    print(f"报告：{json_path}")
    print(f"     {md_path}")

    # CI 门禁
    if args.gate:
        blocked: list[str] = []
        if summary["pass_rate"] < 1.0:
            blocked.append(f"行为通过率 {summary['pass_rate']:.1%} < 100%")
        if args.judge and summary["judge_cases"] > 0:
            faith = summary["judge_scores"].get("faithfulness")
            if faith is None:
                blocked.append("裁判未产出 faithfulness 分数")
            elif faith < args.gate_faith:
                blocked.append(f"faithfulness 均值 {faith} < 阈值 {args.gate_faith}")
        if blocked:
            print("\n❌ 门禁未通过：" + "；".join(blocked), file=sys.stderr)
            return 1
        print("\n✅ 门禁通过")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
