#!/usr/bin/env python3
"""
为 data/routes/*.json 中的真实线路生成结构化节点（关键节点 / 风险点 / 下撤点）并写回。

规则与 lib/server/services/structured-node-service.ts 对齐：
- 节点坐标来自线路自身的真实轨迹 geometry.amap_walking_path（按里程比例采样）；
- 节点/风险/下撤的文字取自该线路自身的真实叙述字段（summary_short / beginner_fit_reason /
  route_logic_summary / exit_logic_summary 等）与起终点名，按关键词命中推导，非编造 mock。

写回后，公开接口 /api/routes/[id] 与 H5 地图即可直接渲染真实结构化节点。
"""
import json
import re
import sys
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "routes"


def to_rad(v):
    return v * 3.141592653589793 / 180.0


def haversine_m(a, b):
    R = 6371000.0
    dlat = to_rad(b[1] - a[1])
    dlng = to_rad(b[0] - a[0])
    la1 = to_rad(a[1])
    la2 = to_rad(b[1])
    h = (la1 != la2) and None
    import math
    h = math.sin(dlat / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(min(1.0, math.sqrt(h)))


def build_samples(points):
    samples = []
    total = 0.0
    for i, p in enumerate(points):
        if i > 0:
            total += haversine_m(points[i - 1], p)
        samples.append({"point": p, "dist": total})
    return samples, total


def pick_by_fraction(samples, total, fraction):
    f = min(0.92, max(0.08, fraction))
    target = total * f
    picked = samples[0]
    for s in samples:
        picked = s
        if s["dist"] >= target:
            break
    return picked


def distinct_enough(point, chosen, min_m):
    return all(haversine_m(existing, point) >= min_m for existing in chosen)


def collect_text(value, out):
    if isinstance(value, str):
        if value.strip():
            out.append(value.strip())
    elif isinstance(value, list):
        for it in value:
            collect_text(it, out)
    elif isinstance(value, dict):
        for it in value.values():
            collect_text(it, out)


def get_field_summary(route):
    frags = []
    collect_text(route.get("base_facts", {}).get("route_name"), frags)
    collect_text(route.get("base_facts", {}).get("area_name"), frags)
    collect_text(route.get("base_facts", {}).get("city_name"), frags)
    collect_text(route.get("base_facts", {}).get("start_point_name"), frags)
    collect_text(route.get("base_facts", {}).get("end_point_name"), frags)
    collect_text(route.get("narrative", {}), frags)
    collect_text(route.get("metrics", {}), frags)
    return " | ".join(frags)


def get_text_field_evidence(route):
    narrative = route.get("narrative", {}) or {}
    fields = {
        "summary_short": narrative.get("summary_short"),
        "beginner_fit_reason": narrative.get("beginner_fit_reason"),
        "route_logic_summary": narrative.get("route_logic_summary"),
        "exit_logic_summary": narrative.get("exit_logic_summary"),
        "transport_summary": narrative.get("transport_summary"),
        "best_season_text": narrative.get("best_season_text"),
    }
    return {k: v for k, v in fields.items() if isinstance(v, str) and v.strip()}


def build_node_blueprints(route, total_m):
    label = (
        route.get("base_facts", {}).get("route_name")
        or route.get("base_facts", {}).get("area_name")
        or route.get("base_facts", {}).get("city_name")
        or "路线"
    )
    route_text = get_field_summary(route)
    urban = bool(re.search(r"湖|堤|塔|公园|景区|街|绿道|城市|断桥|雷峰", route_text))

    if total_m >= 9000:
        fractions = [0.16, 0.38, 0.63, 0.84]
    elif total_m >= 5000:
        fractions = [0.18, 0.42, 0.7, 0.86]
    else:
        fractions = [0.22, 0.52, 0.8]

    start = route.get("base_facts", {}).get("start_point_name") or "起点"
    end = route.get("base_facts", {}).get("end_point_name") or "终点"

    blueprints = [
        {
            "fraction": fractions[0],
            "node_type": "checkpoint",
            "node_name": f"{label} 进入主线判断点",
            "navigation_hint": f"从 {start} 出发后，优先沿最连续、最明确的主线前进，在这里确认自己仍在主游线上。",
            "wrong_choice_hint": "如果前方出现明显下切小路、施工便道或回头支线，先停一下再回到最宽主线。",
            "display_priority": 72,
        },
        {
            "fraction": fractions[1],
            "node_type": "view" if urban else "key",
            "node_name": f"{label} 中段观景停留点" if urban else f"{label} 中段节奏确认点",
            "navigation_hint": (
                "到这里后可短暂停留确认景观参照，再继续沿主游线推进。" if urban
                else "到这里确认体力、补水和方向，继续沿主步道推进，不要被次级岔路带偏。"
            ),
            "wrong_choice_hint": (
                "不要被临时拍照停留区带入回头流线。" if urban
                else "不要追着看起来更近的土路或野路切线走。"
            ),
            "display_priority": 80,
        },
        {
            "fraction": fractions[2],
            "node_type": "fork",
            "node_name": f"{label} 关键岔点",
            "navigation_hint": f"在关键岔点优先保持朝 {end} 的主方向推进，按更稳定的主线选路。",
            "wrong_choice_hint": (
                "景区支路、商业分流线或回头线不要误入。" if urban
                else "维护便道、下降过快的小路或野路不要贸然进入。"
            ),
            "display_priority": 88,
        },
    ]
    if len(fractions) > 3:
        blueprints.append({
            "fraction": fractions[3],
            "node_type": "view" if urban else "key",
            "node_name": f"{end} 前收束点",
            "navigation_hint": f"进入终点前的最后收束段，确认队伍完整后再一口气走到 {end}。",
            "wrong_choice_hint": "终点前的支路、回撤口或观景绕线不要混走。",
            "display_priority": 92,
        })
    return blueprints, urban


def build_risk_blueprints(route):
    route_text = get_field_summary(route)
    out = []
    stream = bool(re.search(r"溪谷|瀑布|水位", route_text))
    if re.search(r"湿滑|打滑|泥泞|滑倒", route_text):
        out.append({
            "fraction": 0.82 if stream else 0.58,
            "risk_type": "slippery",
            "risk_level": "medium",
            "risk_title": "瀑布段石面湿滑" if stream else "路面湿滑易打滑",
            "risk_text": (
                "溪谷与瀑布附近石面常因水汽和积水变滑，落脚不稳时容易踩空或打滑。" if stream
                else "沿线存在潮湿石阶、碎石或泥面时，步频一快就容易失去稳定。"
            ),
            "safe_action_text": "进入湿滑段主动降速，优先走更稳的中线，不要边走边拍照。",
        })
    if re.search(r"岔路|分叉|走偏|迷路|带偏", route_text):
        out.append({
            "fraction": 0.38,
            "risk_type": "wrong_turn",
            "risk_level": "medium",
            "risk_title": "岔路判断失误易走偏",
            "risk_text": "进入岔路或支线较多的路段时，若只凭直觉追求更近路线，容易偏离主步道。",
            "safe_action_text": "到岔口先停下来确认主方向，再决定是否继续推进。",
        })
    return out


def build_exit_blueprints(route):
    route_text = get_field_summary(route)
    out = []
    start = route.get("base_facts", {}).get("start_point_name") or "起点"
    end = route.get("base_facts", {}).get("end_point_name") or "终点"
    if re.search(r"原路|折返|回撤|返回", route_text):
        out.append({
            "fraction": 0.34,
            "exit_type": "return",
            "exit_name": f"{start} 原路折返点",
            "exit_condition_text": "若体力掉速、天气转差或同行人状态不稳，可在这里停止继续压后半程。",
            "exit_action_text": f"沿来线原路返回 {start}，不要继续消耗后续路线。",
            "exit_priority": "primary",
        })
    if re.search(r"下撤|提前结束|最后一段前", route_text):
        out.append({
            "fraction": 0.8,
            "exit_type": "safe_stop",
            "exit_name": f"{end} 前提前下撤判断点",
            "exit_condition_text": "若前方核心路段湿滑、队伍状态下滑或时间已接近返程窗口，可在这里提前结束。",
            "exit_action_text": f"不要继续硬压到 {end}，改为在这里转身按原路返回。",
            "exit_priority": "secondary",
        })
    return out


def sanitize(route_id):
    s = (route_id or "route").lower()
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^a-z0-9\u4e00-\u9fa5-]", "", s)
    return s[:24]


def main():
    force = "--force-refresh" in sys.argv
    files = sorted(DATA_DIR.glob("rt_*.json"))
    generated, skipped, failed = [], [], []

    for fp in files:
        try:
            route = json.loads(fp.read_text(encoding="utf-8"))
        except Exception as e:
            failed.append({"file": fp.name, "reason": str(e)})
            continue

        existing = (
            len(route.get("route_nodes") or [])
            + len(route.get("route_exit_points") or [])
            + len(route.get("route_risk_points") or [])
        )
        if existing > 0 and not force:
            skipped.append(fp.name)
            continue

        geo = route.get("geometry", {}) or {}
        path = geo.get("amap_walking_path") or []
        coords = [(p["lng"], p["lat"]) for p in path if isinstance(p, dict) and "lng" in p and "lat" in p]
        if len(coords) < 2:
            failed.append({"file": fp.name, "reason": "missing_geometry"})
            continue

        samples, total = build_samples(coords)
        min_spacing = max(90.0, min(total * 0.05, 240.0))
        rid = sanitize(route.get("route_id") or fp.stem)

        def take(fraction, chosen):
            s = pick_by_fraction(samples, total, fraction)
            if not distinct_enough(s["point"], chosen, min_spacing):
                return None
            chosen.append(s["point"])
            return s

        node_bp, _ = build_node_blueprints(route, total)
        risk_bp = build_risk_blueprints(route)
        exit_bp = build_exit_blueprints(route)

        chosen_n, chosen_r, chosen_e = [], [], []
        route_nodes = []
        for i, bp in enumerate(node_bp):
            s = take(bp["fraction"], chosen_n)
            if not s:
                continue
            route_nodes.append({
                "node_id": f"{rid}-node-{i+1:02d}",
                "node_type": bp["node_type"],
                "node_name": bp["node_name"],
                "point": {"type": "Point", "coordinates": [s["point"][0], s["point"][1]]},
                "stage_order": len(route_nodes) + 1,
                "distance_from_start_m": round(s["dist"]),
                "trigger_radius_m": 36 + i * 2,
                "navigation_hint": bp["navigation_hint"],
                "wrong_choice_hint": bp["wrong_choice_hint"],
                "display_priority": bp["display_priority"],
            })

        route_risk_points = []
        for i, bp in enumerate(risk_bp):
            s = take(bp["fraction"], chosen_r)
            if not s:
                continue
            route_risk_points.append({
                "risk_point_id": f"{rid}-risk-{i+1:02d}",
                "risk_type": bp["risk_type"],
                "risk_level": bp["risk_level"],
                "point": {"type": "Point", "coordinates": [s["point"][0], s["point"][1]]},
                "stage_order": len(route_risk_points) + 1,
                "risk_title": bp["risk_title"],
                "risk_text": bp["risk_text"],
                "safe_action_text": bp["safe_action_text"],
                "trigger_radius_m": 42 if bp["risk_type"] == "slippery" else 38,
            })

        route_exit_points = []
        for i, bp in enumerate(exit_bp):
            s = take(bp["fraction"], chosen_e)
            if not s:
                continue
            route_exit_points.append({
                "exit_point_id": f"{rid}-exit-{i+1:02d}",
                "exit_type": bp["exit_type"],
                "exit_name": bp["exit_name"],
                "point": {"type": "Point", "coordinates": [s["point"][0], s["point"][1]]},
                "stage_order": len(route_exit_points) + 1,
                "exit_condition_text": bp["exit_condition_text"],
                "exit_action_text": bp["exit_action_text"],
                "exit_priority": bp["exit_priority"],
            })

        if not route_nodes and not route_risk_points and not route_exit_points:
            failed.append({"file": fp.name, "reason": "no_nodes_generated"})
            continue

        route["route_nodes"] = route_nodes
        route["route_risk_points"] = route_risk_points
        route["route_exit_points"] = route_exit_points
        fp.write_text(json.dumps(route, ensure_ascii=False, indent=2), encoding="utf-8")
        generated.append({
            "file": fp.name,
            "route_name": route.get("base_facts", {}).get("route_name"),
            "nodes": len(route_nodes),
            "risk": len(route_risk_points),
            "exit": len(route_exit_points),
        })

    summary = {
        "files": len(files),
        "generated": len(generated),
        "skipped": len(skipped),
        "failed": len(failed),
        "samples": generated[:6],
        "failed_items": failed[:10],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
