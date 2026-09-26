#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
agent-prefill.py —— 用百炼 qwen-plus 为线路补齐描述性文案（阶段 1 的 agent prefill）

背景
----
data/routes/rt_*.json 的 narrative 目前是 build-route-corpus.py 从种子池灌的简短占位文本。
本脚本用大模型把结构化 base_facts + 已核验 metrics 扩写成面向「新手适不适合」的连贯文案。

硬约束（与项目反幻觉定位一致）：
    - 大模型**只允许改写 / 组合已有事实**，严禁编造里程、海拔、设施、门票、节点名等
      任何结构化字段里没有的信息。真实数字只来自 metrics（高德路径规划）。
    - 输出必须是 JSON，字段：description / beginner_fit_reason / search_text。

用法
----
    python3 scripts/agent-prefill.py --limit 3           # 先试 3 条
    python3 scripts/agent-prefill.py                      # 全量 40 条
    python3 scripts/agent-prefill.py --force              # 忽略已 prefill 的，重跑
"""

import argparse
import glob
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REQUEST_INTERVAL = 0.8
TYPE_LABEL = {"out_and_back": "往返线", "loop": "环线", "one_way": "单向穿越"}
DIFF_LABEL = {"easy": "新手友好", "moderate": "中等强度"}


def load_env(path):
    env = {}
    if not os.path.exists(path):
        return env
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def build_prompt(route):
    bf = route.get("base_facts", {})
    m = route.get("metrics", {})
    facts = []
    facts.append(f"线路名：{bf.get('route_name')}")
    facts.append(f"位置：{bf.get('province_name')}{bf.get('city_name')}{bf.get('area_name', '')}")
    facts.append(f"起点：{bf.get('start_point_name')}；终点：{bf.get('end_point_name')}")
    facts.append(f"线路类型：{TYPE_LABEL.get(bf.get('route_type'), bf.get('route_type'))}")
    facts.append(f"难度：{DIFF_LABEL.get(bf.get('difficulty_band'), bf.get('difficulty_band'))}")
    facts.append(f"路面：{'、'.join(bf.get('surface_tags', []))}")
    facts.append(f"适宜季节：{'、'.join(bf.get('season_tags', []))}")
    d, du = m.get("distance_km"), m.get("duration_hours")
    if d:
        facts.append(f"真实里程（高德步行路径规划）：约 {d} 公里")
    if du:
        facts.append(f"真实耗时（高德）：约 {du} 小时")
    facts.append(f"现有简介：{route.get('narrative', {}).get('summary_short', '')}")
    facts.append(f"现有新手理由：{route.get('narrative', {}).get('beginner_fit_reason', '')}")
    return "\n".join(facts)


SYSTEM_PROMPT = (
    "你是徒步线路语料撰写助手。只能基于给定的结构化事实撰写文案，"
    "绝对禁止编造任何数字（里程/海拔/时间）、设施、门票、具体节点名称等事实中不存在的信息。"
    "真实里程与耗时以给定字段为准。语气面向新手徒步爱好者，亲切、克制、可信任。"
    "必须只输出一个 JSON 对象，不要任何解释或 markdown 代码块，格式："
    '{"description": "2-4句连贯介绍，突出对新手是否友好", '
    '"beginner_fit_reason": "一句话说明新手适配点（<=60字）", '
    '"search_text": "把上述事实摊平成的自然语言检索文本，含真实里程/耗时，便于语义检索"}'
)


def call_llm(api_url, api_key, model, user_text, retries=3):
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_text},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.3,
    }
    data = json.dumps(body).encode("utf-8")
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                api_url, data=data,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=40) as resp:
                out = json.loads(resp.read().decode("utf-8"))
            usage = out.get("usage", {})
            content = out["choices"][0]["message"]["content"]
            return content, usage, None
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
            time.sleep(1.5 * (attempt + 1))
    return None, None, last_err


def parse_json(text):
    if not text:
        return None
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def reindex(root):
    files = sorted(glob.glob(os.path.join(root, "data", "routes", "rt_*.json")))
    routes = []
    for path in files:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        geom = d.get("geometry", {})
        metrics = d.get("metrics", {})
        prov = d.get("provenance", {})
        routes.append(
            {
                "route_id": d.get("route_id"),
                "route_name": d.get("base_facts", {}).get("route_name"),
                "province_name": d.get("base_facts", {}).get("province_name"),
                "city_name": d.get("base_facts", {}).get("city_name"),
                "difficulty_band": d.get("base_facts", {}).get("difficulty_band"),
                "route_type": d.get("base_facts", {}).get("route_type"),
                "geocode_status": geom.get("geocode_status"),
                "distance_km": metrics.get("distance_km"),
                "metrics_status": metrics.get("verification_status"),
                "narrative_source": prov.get("narrative", {}).get("source"),
            }
        )
    index = {
        "schema_version": "1.0",
        "rebuilt_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "count": len(routes),
        "routes": routes,
    }
    with open(os.path.join(root, "data", "routes", "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    env = load_env(os.path.join(ROOT, ".env.local"))
    api_url = env.get("AGENT_PREFILL_API_URL", "")
    api_key = env.get("AGENT_PREFILL_API_KEY", "")
    model = env.get("AGENT_PREFILL_MODEL", "qwen-plus")
    if not (api_url and api_key):
        print("❌ .env.local 缺少 AGENT_PREFILL_API_URL / AGENT_PREFILL_API_KEY")
        sys.exit(1)

    files = sorted(glob.glob(os.path.join(ROOT, "data", "routes", "rt_*.json")))
    if args.limit:
        files = files[: args.limit]

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    os.makedirs(os.path.join(ROOT, "logs"), exist_ok=True)
    trace_path = os.path.join(ROOT, "logs", f"agent-prefill-{run_id}.jsonl")

    def trace(event, ok, rid, **detail):
        rec = {"ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
               "run_id": run_id, "event": event, "ok": ok, "route_id": rid, "detail": detail}
        with open(trace_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    print(f"待处理 {len(files)} 条（model={model}）{'（dry-run 不落盘）' if args.dry_run else ''}\n")
    done = 0
    for path in files:
        with open(path, encoding="utf-8") as f:
            route = json.load(f)
        rid = route.get("route_id", os.path.basename(path))
        name = route.get("base_facts", {}).get("route_name", "?")
        nar = route.setdefault("narrative", {})

        if nar.get("source") == "agent_prefill_qwen_plus" and not args.force \
           and route.get("provenance", {}).get("narrative", {}).get("source") == "agent_prefill_qwen_plus":
            print(f"{rid:<16}{name:<18} 已prefill 跳过")
            continue

        user_text = build_prompt(route)
        time.sleep(REQUEST_INTERVAL)
        content, usage, err = call_llm(api_url, api_key, model, user_text)
        if err:
            trace("llm_call", False, rid, error=err)
            print(f"{rid:<16}{name:<18} ❌ {err}")
            continue
        obj = parse_json(content)
        if not obj or not obj.get("description"):
            trace("parse", False, rid, raw=content[:200])
            print(f"{rid:<16}{name:<18} ❌ JSON解析失败")
            continue

        # 仅更新描述性字段，保留 summary_short 种子短句作为标题行
        nar["description"] = obj.get("description", "").strip()
        if obj.get("beginner_fit_reason"):
            nar["beginner_fit_reason"] = obj["beginner_fit_reason"].strip()
        if obj.get("search_text"):
            nar["search_text"] = obj["search_text"].strip()
        nar["source"] = "agent_prefill_qwen_plus"

        route.setdefault("provenance", {})["narrative"] = {
            "source": "agent_prefill_qwen_plus",
            "model": model,
            "run_id": run_id,
            "verified": False,
            "note": "LLM 扩写描述性文本，未引入新事实；数字仅来自 metrics",
        }
        trace("prefill", True, rid, tokens=usage, has_description=bool(nar.get("description")))
        done += 1
        print(f"{rid:<16}{name:<18} ✅ {nar['description'][:24]}…")

        if not args.dry_run:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(route, f, ensure_ascii=False, indent=2)
                f.write("\n")

    if not args.dry_run:
        reindex(ROOT)
        print(f"\n✅ 完成 {done}/{len(files)} 条，已回填 index.json；trace: logs/agent-prefill-{run_id}.jsonl")
    else:
        print("\n(dry-run 未落盘)")


if __name__ == "__main__":
    main()
