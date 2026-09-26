#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build-rag-index.py —— 阶段 2：切片 → embedding → 检索索引构建

读取 data/routes/rt_*.json，为每条线路生成 4 类检索 chunk（身份/画像/描述/地理），
调用阿里百炼 text-embedding-v3（1024 维）做向量化，产出文件化向量索引
data/rag/route-index.json，并写一条管线埋点 trace（logs/rag-build-*.jsonl）。

设计要点（与项目反幻觉定位一致）：
  - 检索文本只由 route 文件里已有的结构化事实拼装，绝不引入外部/编造信息。
  - 索引是「文件化 + 内存余弦检索」：运行时 Retriever 加载本文件、对用户 query 做
    向量化后再余弦 top-K，按 route 聚合（取最佳匹配 chunk 作为可点开溯源依据）。
  - 单条线路对应多个 chunk，覆盖不同检索意图：
      1) identity  —— 名称/省市/区/线路类型，命中「深圳」「往返线」等
      2) profile   —— 难度/里程/耗时/路面/季节/起终点，命中「轻松」「短」「秋季」
      3) description —— narrative 描述+新手理由，语义命中「适合新手/看海/亲子」
      4) geo       —— 城市/区/起终点 POI/搜索词，命中地理位置类问法

用法：
    python3 scripts/build-rag-index.py              # 全量构建
    python3 scripts/build-rag-index.py --force       # 忽略已存在索引，强制重建
"""

import argparse
import glob
import json
import math
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTES_DIR = os.path.join(ROOT, "data", "routes")
RAG_DIR = os.path.join(ROOT, "data", "rag")
LOGS_DIR = os.path.join(ROOT, "logs")
EMBED_MODEL = "text-embedding-v3"
EMBED_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings"
BATCH = 10  # 百炼 text-embedding-v3 单次 embedding 请求上限为 10 条

TYPE_LABEL = {"out_and_back": "往返线", "loop": "环线", "one_way": "单向穿越"}
DIFF_LABEL = {"easy": "新手友好", "moderate": "中等强度"}


def load_env():
    """读取 .env / .env.local（与 agent-prefill.py 一致，Next.js 用 .env.local）。"""
    env = {}
    for fn in (".env", ".env.local"):
        p = os.path.join(ROOT, fn)
        if os.path.exists(p):
            for line in open(p, encoding="utf-8"):
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def get_api_key(env):
    return os.environ.get("AGENT_PREFILL_API_KEY") or env.get("AGENT_PREFILL_API_KEY")


# --------------------------------------------------------------------------- #
# 切片：一条线路 -> 若干 (chunk_type, text) 对
# --------------------------------------------------------------------------- #
def build_chunks(route):
    bf = route.get("base_facts", {})
    nar = route.get("narrative", {})
    m = route.get("metrics", {})
    name = bf.get("route_name", "")
    prov = bf.get("province_name", "")
    city = bf.get("city_name", "")
    area = bf.get("area_name", "")
    rtype = bf.get("route_type", "")
    rtype_lbl = TYPE_LABEL.get(rtype, rtype)
    diff = bf.get("difficulty_band", "")
    diff_lbl = DIFF_LABEL.get(diff, diff)
    surfaces = "、".join(bf.get("surface_tags", []))
    seasons = "、".join(bf.get("season_tags", []))
    dist = m.get("distance_km")
    dur = m.get("duration_hours")
    start = bf.get("start_point_name", "")
    end = bf.get("end_point_name", "")
    kw = bf.get("map_search_keyword", "")
    summary = nar.get("summary_short", "")
    fit = nar.get("beginner_fit_reason", "")
    desc = nar.get("description", "")

    dist_txt = f"约 {dist} 公里" if dist is not None else "里程待补"
    dur_txt = f"约 {dur} 小时" if dur is not None else "耗时待补"

    chunks = []

    # 1) identity：名称 / 行政区划 / 类型
    chunks.append((
        "identity",
        f"{name}｜位于{prov}{city}{area}｜{rtype_lbl}｜{diff_lbl}",
    ))

    # 2) profile：难度 / 里程 / 耗时 / 路面 / 季节 / 起终点
    chunks.append((
        "profile",
        f"{name}是一条{diff_lbl}的{rtype_lbl}，{dist_txt}，{dur_txt}。"
        f"路面：{surfaces or '未标注'}。适宜季节：{seasons or '未标注'}。"
        f"起点：{start}；终点：{end}。",
    ))

    # 3) description：语义描述 + 新手适配理由
    chunks.append((
        "description",
        f"{desc} {fit}".strip() or summary,
    ))

    # 4) geo：地理位置检索文本
    chunks.append((
        "geo",
        f"{prov}{city}{area}的徒步线路：{name}。起点{start}，终点{end}。"
        f"检索词：{kw}。",
    ))

    return chunks


def build_route_card(route):
    bf = route.get("base_facts", {})
    nar = route.get("narrative", {})
    m = route.get("metrics", {})
    geom = route.get("geometry", {})
    return {
        "route_id": route.get("route_id"),
        "route_name": bf.get("route_name"),
        "province_name": bf.get("province_name"),
        "city_name": bf.get("city_name"),
        "area_name": bf.get("area_name"),
        "difficulty_band": bf.get("difficulty_band"),
        "difficulty_label": DIFF_LABEL.get(bf.get("difficulty_band"), bf.get("difficulty_band")),
        "route_type": bf.get("route_type"),
        "route_type_label": bf.get("route_type_label") or TYPE_LABEL.get(bf.get("route_type"), bf.get("route_type")),
        "distance_km": m.get("distance_km"),
        "duration_hours": m.get("duration_hours"),
        "ascent_m": m.get("ascent_m"),
        "surface_tags": bf.get("surface_tags", []),
        "season_tags": bf.get("season_tags", []),
        "start_point_name": bf.get("start_point_name"),
        "end_point_name": bf.get("end_point_name"),
        "summary_short": nar.get("summary_short"),
        "description": nar.get("description"),
        "geometry_status": geom.get("geocode_status"),
    }


# --------------------------------------------------------------------------- #
# embedding：批量调用百炼 text-embedding-v3
# --------------------------------------------------------------------------- #
def embed_batch(texts, api_key, retries=3):
    body = json.dumps({"model": EMBED_MODEL, "input": texts}).encode("utf-8")
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                EMBED_URL, data=body,
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                payload = json.load(resp)
            data = payload.get("data", [])
            # 按 index 排序还原顺序
            data.sort(key=lambda x: x.get("index", 0))
            embs = [d["embedding"] for d in data]
            usage = payload.get("usage", {})
            return embs, usage
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code}: {e.read().decode()[:200]}"
        except Exception as e:  # noqa
            last_err = str(e)
        time.sleep(1.0 * (attempt + 1))
    raise RuntimeError(f"embedding 失败：{last_err}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="强制重建（默认若索引存在则跳过）")
    args = ap.parse_args()

    env = load_env()
    api_key = get_api_key(env)
    if not api_key:
        raise SystemExit("缺少 AGENT_PREFILL_API_KEY（请在 .env.local 配置百炼 Key）")

    os.makedirs(RAG_DIR, exist_ok=True)
    os.makedirs(LOGS_DIR, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    trace_path = os.path.join(LOGS_DIR, f"rag-build-{ts}.jsonl")
    trace_id = f"rag-build-{ts}"

    def trace(stage, route_id, in_sum, out_sum, cost_ms, tokens, ok, err=None):
        rec = {
            "trace_id": trace_id, "stage": stage, "route_id": route_id,
            "input_summary": in_sum, "output_summary": out_sum,
            "cost_ms": cost_ms, "tokens": tokens, "success": ok,
        }
        if err:
            rec["error"] = err
        with open(trace_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    files = sorted(glob.glob(os.path.join(ROUTES_DIR, "rt_*.json")))
    if not files:
        raise SystemExit(f"未找到线路文件：{ROUTES_DIR}")

    routes = [json.load(open(p, encoding="utf-8")) for p in files]

    # ---- 切片 ----
    t0 = time.time()
    all_chunks = []  # (route_id, route_name, city, chunk_type, text)
    route_cards = {}
    for r in routes:
        rid = r.get("route_id")
        bf = r.get("base_facts", {})
        route_cards[rid] = build_route_card(r)
        for ctype, text in build_chunks(r):
            all_chunks.append((rid, bf.get("route_name", ""), bf.get("city_name", ""), ctype, text))
    slice_ms = int((time.time() - t0) * 1000)
    trace("切片", "ALL", f"{len(routes)} 条线路", f"{len(all_chunks)} 个 chunk（4 类/线）", slice_ms, 0, True)
    print(f"切片完成：{len(routes)} 条线路 → {len(all_chunks)} 个 chunk（耗时 {slice_ms}ms）")

    # ---- embedding（分批）----
    texts = [c[4] for c in all_chunks]
    embeddings = []
    total_tokens = 0
    t0 = time.time()
    for i in range(0, len(texts), BATCH):
        batch = texts[i:i + BATCH]
        bt0 = time.time()
        embs, usage = embed_batch(batch, api_key)
        embeddings.extend(embs)
        tok = usage.get("prompt_tokens") or usage.get("total_tokens") or 0
        total_tokens += tok
        cost_ms = int((time.time() - bt0) * 1000)
        trace("embedding", "BATCH", f"{len(batch)} 文本", f"{len(embs)} 向量/{tok} tokens", cost_ms, tok, True)
    emb_ms = int((time.time() - t0) * 1000)
    print(f"embedding 完成：{len(embeddings)} 向量，{total_tokens} tokens（耗时 {emb_ms}ms）")

    # ---- 组装索引 ----
    chunks_out = []
    for idx, (rid, rname, city, ctype, text) in enumerate(all_chunks):
        chunks_out.append({
            "chunk_id": f"c{idx:04d}",
            "route_id": rid,
            "route_name": rname,
            "city_name": city,
            "chunk_type": ctype,
            "text": text,
            "embedding": embeddings[idx],
        })

    index = {
        "built_at": datetime.now(timezone.utc).isoformat(),
        "model": EMBED_MODEL,
        "dim": len(embeddings[0]) if embeddings else 1024,
        "route_count": len(routes),
        "chunk_count": len(chunks_out),
        "route_cards": route_cards,
        "chunks": chunks_out,
    }
    out_path = os.path.join(RAG_DIR, "route-index.json")
    json.dump(index, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"索引已写入：{out_path}（routes={index['route_count']}, chunks={index['chunk_count']}, dim={index['dim']}）")

    # ---- 检索验证（埋点：用样本 query 跑余弦 top-K，证明检索闭环可用）----
    sample_queries = [
        "深圳适合带娃的轻松短途线路，想看海",
        "北京秋天登高看红叶的古道",
        "杭州西湖边平缓好走的新手线",
        "成都道教名山景区步道",
        "上海松江超级短的微徒步",
    ]
    verify_lines = []
    for q in sample_queries:
        q_emb, _ = embed_batch([q], api_key)
        top = _cosine_top_routes(q_emb[0], chunks_out, route_cards, 3)
        verify_lines.append({"query": q, "top3": [
            {"route": r["route_name"], "city": r["city_name"], "score": round(r["score"], 4),
             "matched_chunk": r["matched_chunk_type"]}
            for r in top
        ]})
        print(f"  检索「{q}」→ {top[0]['route_name']}({top[0]['city_name']}) score={top[0]['score']:.3f}")
    trace("检索", "ALL", f"{len(sample_queries)} 样本 query",
          "top1: " + "；".join(f"{v['top3'][0]['route']}" for v in verify_lines), emb_ms, total_tokens, True)
    # 把验证结果附到索引便于人工抽查
    index["_verify"] = verify_lines
    json.dump(index, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    print(f"\n✅ 阶段 2 索引构建完成。埋点：{trace_path}")


def _cosine_top_routes(query_vec, chunks, route_cards, top_k):
    """内存余弦：chunk 级打分 → 按 route 取最高分 chunk 聚合，返回 top-K route。"""
    # 先算每个 chunk 与 query 的余弦
    scored = []
    for c in chunks:
        emb = c["embedding"]
        dot = sum(a * b for a, b in zip(query_vec, emb))
        na = math.sqrt(sum(a * a for a in query_vec))
        nb = math.sqrt(sum(b * b for b in emb))
        sim = dot / (na * nb) if na and nb else 0.0
        scored.append((c["route_id"], sim, c["chunk_type"], c["text"]))
    # 按 route 聚合：取最高 chunk 分 + 该 chunk 作为溯源
    best = {}
    for rid, sim, ctype, text in scored:
        if rid not in best or sim > best[rid]["score"]:
            best[rid] = {"score": sim, "matched_chunk_type": ctype, "matched_text": text}
    ranked = sorted(best.items(), key=lambda kv: kv[1]["score"], reverse=True)[:top_k]
    out = []
    for rid, info in ranked:
        card = route_cards.get(rid, {})
        out.append({
            "route_id": rid,
            "route_name": card.get("route_name"),
            "city_name": card.get("city_name"),
            "score": info["score"],
            "matched_chunk_type": info["matched_chunk_type"],
        })
    return out


if __name__ == "__main__":
    main()
