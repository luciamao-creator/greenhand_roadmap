#!/usr/bin/env python3
"""路线语料构建器：种子清单 -> data/routes/ 文件化语料。

阶段 1 产物，为阶段 2 的 embedding 与 chatbot 提供语料底座。

设计约束（见 docs/decisions/2026-09-15-mvp-goal-and-scope.md §5）：
- 不依赖数据库，语料文件化 + 版本可控
- **不生成未经核验的数字事实**（距离/爬升/时长恒为 None + 标记待核验），
  这与产品「用经过检验的线路约束大模型」的定位一致；
  本项目的对手不是数据不够，而是编出来的数据。
- 每个生产环节写入 jsonl trace，供最终测试阶段归因

用法：
    python3 scripts/build-route-corpus.py
    python3 scripts/build-route-corpus.py --strict   # 任何告警即失败
"""

import argparse
import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SEED_FILE = PROJECT_ROOT / "scripts" / "route-seeds-40.json"
OUT_DIR = PROJECT_ROOT / "data" / "routes"
LOG_DIR = PROJECT_ROOT / "logs"

SCHEMA_VERSION = "1.0"

REQUIRED_FIELDS = [
    "route_name",
    "province_name",
    "city_name",
    "area_name",
    "start_point_name",
    "end_point_name",
    "route_type",
    "map_search_keyword",
    "difficulty_band",
    "surface_tags",
    "season_tags",
    "beginner_fit_reason",
    "summary_short",
]

VALID_ROUTE_TYPES = {"out_and_back", "loop", "one_way"}
VALID_DIFFICULTY = {"easy", "moderate"}

ROUTE_TYPE_LABEL = {
    "out_and_back": "往返线",
    "loop": "环线",
    "one_way": "单向穿越",
}


class Trace:
    """每个生产环节写一条 jsonl，便于最终测试阶段归因。"""

    def __init__(self, run_id: str, path: Path):
        self.run_id = run_id
        self.path = path
        self._fh = open(path, "w", encoding="utf-8")

    def emit(self, stage: str, event: str, ok: bool, route_name: str = "", **detail):
        record = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "run_id": self.run_id,
            "stage": stage,
            "event": event,
            "ok": ok,
            "route_name": route_name,
            "detail": detail,
        }
        self._fh.write(json.dumps(record, ensure_ascii=False) + "\n")
        self._fh.flush()
        return record

    def close(self):
        self._fh.close()


def stable_route_id(province: str, city: str, name: str) -> str:
    raw = f"{province}|{city}|{name}"
    return "rt_" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:10]


def validate(item: dict, index: int, warnings: list) -> list:
    """返回该条目的错误列表（空列表代表通过）。"""
    errors = []
    name = item.get("route_name", f"<第 {index} 条>")

    for field in REQUIRED_FIELDS:
        value = item.get(field)
        if value is None or (isinstance(value, str) and not value.strip()):
            errors.append(f"字段缺失或为空: {field}")
        elif isinstance(value, list) and len(value) == 0:
            errors.append(f"数组字段为空: {field}")

    route_type = item.get("route_type")
    if route_type and route_type not in VALID_ROUTE_TYPES:
        errors.append(f"非法 route_type: {route_type}（可选 {sorted(VALID_ROUTE_TYPES)}）")

    difficulty = item.get("difficulty_band")
    if difficulty and difficulty not in VALID_DIFFICULTY:
        errors.append(f"非法 difficulty_band: {difficulty}（可选 {sorted(VALID_DIFFICULTY)}）")

    for field in ("beginner_fit_reason", "summary_short"):
        text = item.get(field) or ""
        if len(text) > 80:
            warnings.append(f"{name}: {field} 偏长（{len(text)} 字），建议压缩到 80 字内")

    return errors


def build_search_text(item: dict) -> str:
    """阶段 2 将对此字段做 embedding。这里把结构化事实摊平成自然语言。"""
    parts = [
        f"{item['province_name']}{item['city_name']}{item['area_name']}",
        item["route_name"],
        f"起点 {item['start_point_name']}，终点 {item['end_point_name']}",
        f"线路类型：{ROUTE_TYPE_LABEL[item['route_type']]}",
        f"难度：{'新手友好' if item['difficulty_band'] == 'easy' else '中等强度'}",
        f"路面：{'、'.join(item['surface_tags'])}",
        f"适宜季节：{'、'.join(item['season_tags'])}",
        item["summary_short"],
        f"新手适配理由：{item['beginner_fit_reason']}",
    ]
    return "。".join(parts) + "。"


def build_document(item: dict, built_at: str) -> dict:
    return {
        "schema_version": SCHEMA_VERSION,
        "route_id": stable_route_id(
            item["province_name"], item["city_name"], item["route_name"]
        ),
        "built_at": built_at,
        # ---- 基础事实：全部来自人工录入的种子，可逐字段溯源 ----
        "base_facts": {
            "route_name": item["route_name"],
            "province_name": item["province_name"],
            "city_name": item["city_name"],
            "area_name": item["area_name"],
            "start_point_name": item["start_point_name"],
            "end_point_name": item["end_point_name"],
            "route_type": item["route_type"],
            "route_type_label": ROUTE_TYPE_LABEL[item["route_type"]],
            "difficulty_band": item["difficulty_band"],
            "surface_tags": item["surface_tags"],
            "season_tags": item["season_tags"],
            "map_search_keyword": item["map_search_keyword"],
        },
        # ---- 描述性文本：阶段 2 embedding 的输入 ----
        "narrative": {
            "summary_short": item["summary_short"],
            "beginner_fit_reason": item["beginner_fit_reason"],
            "search_text": build_search_text(item),
        },
        # ---- 几何数据：待地图 API 补全，不得凭空编造坐标 ----
        "geometry": {
            "start_point": {"lng": None, "lat": None},
            "end_point": {"lng": None, "lat": None},
            "polyline": [],
            "geocode_status": "pending",
            "note": "坐标必须由高德 Web服务 API 回填，禁止在未核验前写入任何坐标",
        },
        # ---- 量化事实：同样待核验 ----
        "metrics": {
            "distance_km": None,
            "ascent_m": None,
            "duration_hours": None,
            "verification_status": "pending",
        },
        # ---- 溯源：每条语料都记录自己是怎么来的 ----
        "provenance": {
            "base_facts": {"source": "manual_seed", "seed_file": SEED_FILE.name},
            "narrative": {"source": "manual_seed", "seed_file": SEED_FILE.name},
            "geometry": {"source": "pending_amap_web_service", "verified": False},
            "metrics": {"source": "not_available", "verified": False},
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict", action="store_true", help="存在任何告警即退出非零")
    args = parser.parse_args()

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    trace = Trace(run_id, LOG_DIR / f"corpus-build-{run_id}.jsonl")

    t_start = time.perf_counter()

    # ---- 环节 1：载入 ----
    try:
        seeds = json.loads(SEED_FILE.read_text(encoding="utf-8"))
        trace.emit("load", "seed_loaded", True, item_count=len(seeds), seed_file=str(SEED_FILE))
    except Exception as exc:
        trace.emit("load", "seed_loaded", False, error=str(exc))
        print(f"[corpus] 读取种子失败：{exc}", file=sys.stderr)
        return 1

    # ---- 环节 2：校验 ----
    warnings: list = []
    valid_items = []
    for index, item in enumerate(seeds):
        name = item.get("route_name", f"<第 {index} 条>")
        errors = validate(item, index, warnings)
        if errors:
            trace.emit("validate", "item_invalid", False, name, errors=errors)
        else:
            valid_items.append(item)
            trace.emit("validate", "item_valid", True, name)
    trace.emit(
        "validate", "validation_done", len(valid_items) == len(seeds),
        valid_count=len(valid_items), invalid_count=len(seeds) - len(valid_items),
        warning_count=len(warnings),
    )

    # ---- 环节 3：构建文档 ----
    built_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    documents = []
    seen_ids = {}
    for item in valid_items:
        doc = build_document(item, built_at)
        rid = doc["route_id"]
        if rid in seen_ids:
            trace.emit("build", "duplicate_id", False, item["route_name"], route_id=rid, conflict=seen_ids[rid])
            continue
        seen_ids[rid] = item["route_name"]
        documents.append(doc)
    trace.emit("build", "documents_built", True, doc_count=len(documents))

    # ---- 环节 4：写入 ----
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for doc in documents:
        target = OUT_DIR / f"{doc['route_id']}.json"
        if target.exists():
            target.unlink()
        target.write_text(
            json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        written += 1
    trace.emit("write", "files_written", written == len(documents), written_count=written)

    # ---- 环节 5：索引 ----
    index = {
        "schema_version": SCHEMA_VERSION,
        "built_at": built_at,
        "count": len(documents),
        "routes": [
            {
                "route_id": d["route_id"],
                "route_name": d["base_facts"]["route_name"],
                "province_name": d["base_facts"]["province_name"],
                "city_name": d["base_facts"]["city_name"],
                "difficulty_band": d["base_facts"]["difficulty_band"],
                "route_type": d["base_facts"]["route_type"],
                "geocode_status": d["geometry"]["geocode_status"],
            }
            for d in documents
        ],
    }
    (OUT_DIR / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    trace.emit("write", "index_written", True, count=len(documents))

    elapsed = round((time.perf_counter() - t_start) * 1000, 1)
    trace.emit("done", "run_finished", True, elapsed_ms=elapsed, written_count=written)
    trace.close()

    # ---- 汇总 ----
    provinces = {}
    for d in documents:
        p = d["base_facts"]["province_name"]
        provinces[p] = provinces.get(p, 0) + 1
    difficulty_dist = {}
    for d in documents:
        k = d["base_facts"]["difficulty_band"]
        difficulty_dist[k] = difficulty_dist.get(k, 0) + 1

    print(json.dumps({
        "run_id": run_id,
        "seed_count": len(seeds),
        "valid_count": len(valid_items),
        "duplicate_count": len(valid_items) - len(documents),
        "written_count": written,
        "province_coverage": len(provinces),
        "provinces": provinces,
        "difficulty_distribution": difficulty_dist,
        "warning_count": len(warnings),
        "warnings": warnings[:10],
        "elapsed_ms": elapsed,
        "output_dir": str(OUT_DIR),
        "trace_log": str(LOG_DIR / f"corpus-build-{run_id}.jsonl"),
    }, ensure_ascii=False, indent=2))

    if args.strict and warnings:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
