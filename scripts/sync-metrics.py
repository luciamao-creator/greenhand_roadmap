#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync-metrics.py —— 用高德步行路径规划 API 回填线路真实里程 / 时长

背景
----
data/routes/rt_*.json 的 metrics 目前全是 null，verification_status="pending"。
本项目的硬约束（build-route-corpus.py 头部明确写明）：
    「不生成未经核验的数字事实（距离/爬升/时长恒为 None + 标记待核验）」
所以 metrics 不能交给大模型编，必须来自真实 API。

高德「步行路径规划」返回每条线路的：
    - distance（米，真实路网距离）
    - duration（秒，真实步行耗时）
    - steps[].polyline（路网轨迹点，顺手存为 geometry.amap_walking_path，供阶段 4/5 地图使用）

爬升（ascent_m）高德无高程数据，本脚本**不编造**，保持 null 并在 note 中说明。

用法
----
    python3 scripts/sync-metrics.py --limit 5           # 先跑 5 条
    python3 scripts/sync-metrics.py                      # 全量 40 条
    python3 scripts/sync-metrics.py --force              # 忽略已 verified 的，重跑
    python3 scripts/sync-metrics.py --dry-run            # 只打印，不落盘
"""

import argparse
import glob
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WALKING_URL = "https://restapi.amap.com/v3/direction/walking"
REQUEST_INTERVAL = 0.4

#  sanity 护栏：新手/休闲徒步线不可能超过这个里程（米），超过说明路网规划
#  把山野步道错误地引到了公路长途，属于不可信结果，置空交人工。
MAX_DISTANCE_M = 60_000
MIN_DISTANCE_M = 60


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


def walking_route(origin, destination, key, retries=3):
    """高德步行路径规划。返回 (paths列表, 错误信息)。

    高德失败藏在 HTTP 200 里（status="0"），只看 HTTP 码会误判成功。
    origin/destination 格式：'经度,纬度'（注意是高德顺序，不是 lat,lng）。
    """
    params = urllib.parse.urlencode(
        {"origin": origin, "destination": destination, "key": key}
    )
    url = f"{WALKING_URL}?{params}"
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "route-metrics-sync/1.0"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code}"
        except Exception as e:  # 网络抖动
            last_err = f"{type(e).__name__}: {e}"
        else:
            if body.get("status") == "1":
                return body.get("route", {}).get("paths", []), None
            return [], f'{body.get("info")} (infocode={body.get("infocode")})'
        time.sleep(1.0 * (attempt + 1))
    return [], last_err or "未知错误"


def parse_polyline(paths):
    """把 steps 里的 'lng,lat;lng,lat' 摊平成点列表。"""
    pts = []
    for path in paths:
        for step in path.get("steps", []):
            raw = step.get("polyline") or ""
            for pair in raw.split(";"):
                if "," not in pair:
                    continue
                lng_s, lat_s = pair.split(",", 1)
                try:
                    pts.append({"lng": round(float(lng_s), 6), "lat": round(float(lat_s), 6)})
                except ValueError:
                    continue
    return pts


def reindex(root):
    """重新生成 data/routes/index.json（修正过期的 geocode_status / 补 metrics 状态）。"""
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
    out = os.path.join(root, "data", "routes", "index.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    env = load_env(os.path.join(ROOT, ".env.local"))
    key = env.get("AMAP_WEB_SERVICE_KEY", "")
    if not key:
        print("❌ .env.local 里没有 AMAP_WEB_SERVICE_KEY")
        sys.exit(1)

    files = sorted(glob.glob(os.path.join(ROOT, "data", "routes", "rt_*.json")))
    if args.limit:
        files = files[: args.limit]

    print(f"待处理 {len(files)} 条{'（dry-run 不落盘）' if args.dry_run else ''}\n")

    ok = 0
    for path in files:
        with open(path, encoding="utf-8") as f:
            route = json.load(f)
        rid = route.get("route_id", os.path.basename(path))
        name = route.get("base_facts", {}).get("route_name", "?")
        geom = route.setdefault("geometry", {})
        metrics = route.setdefault("metrics", {})
        sp = geom.get("start_point") or {}
        ep = geom.get("end_point") or {}

        # 没有真实坐标就无法算路网距离
        if not (sp.get("lng") and ep.get("lng")):
            metrics["distance_km"] = None
            metrics["duration_hours"] = None
            metrics["ascent_m"] = None
            metrics["verification_status"] = "skipped_no_geometry"
            metrics["note"] = "起终点坐标缺失，无法调用路径规划"
            route.setdefault("provenance", {})["metrics"] = {
                "source": "amap_webservice_walking",
                "verified": False,
                "note": "skipped: no geometry",
            }
            print(f"{rid:<16}{name:<18} 跳过：无坐标")
            continue

        if metrics.get("verification_status") == "verified_amap_walking" and not args.force:
            print(f"{rid:<16}{name:<18} 已verified 跳过")
            ok += 1
            continue

        origin = f"{sp['lng']},{sp['lat']}"
        destination = f"{ep['lng']},{ep['lat']}"
        time.sleep(REQUEST_INTERVAL)
        paths, err = walking_route(origin, destination, key)

        if err:
            metrics.update(
                distance_km=None, duration_hours=None, ascent_m=None,
                verification_status="api_error", note=f"步行路径规划失败：{err}",
            )
            route.setdefault("provenance", {})["metrics"] = {
                "source": "amap_webservice_walking", "verified": False, "note": err,
            }
            print(f"{rid:<16}{name:<18} API错误：{err}")
            continue

        if not paths:
            metrics.update(
                distance_km=None, duration_hours=None, ascent_m=None,
                verification_status="api_no_route", note="高德未返回可行步行路线（可能为山野步道，路网缺失）",
            )
            route.setdefault("provenance", {})["metrics"] = {
                "source": "amap_webservice_walking", "verified": False,
                "note": "no walking route returned",
            }
            print(f"{rid:<16}{name:<18} 无步行路线")
            continue

        distance_m = int(paths[0].get("distance", 0) or 0)
        duration_s = int(paths[0].get("duration", 0) or 0)
        polyline = parse_polyline(paths)
        raw_km = distance_m / 1000.0
        route_type = route.get("base_facts", {}).get("route_type")

        # 护栏 1：明显不可信的错配距离
        if distance_m > MAX_DISTANCE_M:
            metrics.update(
                distance_km=None, duration_hours=None, ascent_m=None,
                verification_status="far_review",
                note=f"路网距离 {round(raw_km,1)}km 超出护栏({MAX_DISTANCE_M//1000}km)，疑似错配，置空待人工",
            )
            route.setdefault("provenance", {})["metrics"] = {
                "source": "amap_webservice_walking", "verified": False,
                "note": "distance exceeds guard",
            }
            print(f"{rid:<16}{name:<18} ⚠ {round(raw_km,1)}km 超护栏，置空")
            continue

        if route_type == "loop":
            if raw_km < 0.2:
                # 环线起终点就是同一登山口，路网距离≈0，无法推出全程里程
                metrics.update(
                    distance_km=None, duration_hours=None, ascent_m=None,
                    verification_status="loop_same_endpoint",
                    note="环线起终点重合，高德路网距离≈0，全程里程需 GPX/实地轨迹，暂缺（不编造）",
                )
                route.setdefault("provenance", {})["metrics"] = {
                    "source": "amap_webservice_walking", "verified": False,
                    "note": "loop with coincident endpoints",
                }
                print(f"{rid:<16}{name:<18} 环线同点，里程暂缺")
                continue
            # 环线但起终点不同名：存起终点路网间距，明确非全程
            metrics["distance_km"] = round(raw_km, 2)
            metrics["duration_hours"] = round(duration_s / 3600, 2)
            metrics["ascent_m"] = None
            metrics["verification_status"] = "partial_amap_walking"
            metrics["note"] = (
                "distance_km 为起终点高德路网间距（环线全程通常更长），真实可溯源；"
                "ascent_m 高德无高程 API，暂缺"
            )
            route.setdefault("provenance", {})["metrics"] = {
                "source": "amap_webservice_walking", "verified": True,
                "note": "loop chord distance",
            }
        else:
            # one_way：起→终即全程；out_and_back：往返 = 2× 起→终（确定性折算）
            if distance_m < MIN_DISTANCE_M:
                metrics.update(
                    distance_km=None, duration_hours=None, ascent_m=None,
                    verification_status="suspicious_short",
                    note=f"路网距离 {round(raw_km,2)}km 过短，起终点可能过近，置空待人工",
                )
                route.setdefault("provenance", {})["metrics"] = {
                    "source": "amap_webservice_walking", "verified": False,
                    "note": "distance too short",
                }
                print(f"{rid:<16}{name:<18} ⚠ {round(raw_km,2)}km 过短，置空")
                continue
            factor = 2 if route_type == "out_and_back" else 1
            total_km = raw_km * factor
            # 护栏 2：新手/休闲线单日往返不可能超 20km，超了说明高德把山野步道
            # 错引到公路长途（典型如绕山公路），结果不可信，置空交人工。
            if total_km > 20:
                metrics.update(
                    distance_km=None, duration_hours=None, ascent_m=None,
                    verification_status="far_review",
                    note=f"路网往返 {round(total_km,1)}km 超出新手线护栏(20km)，疑似公路长途错引，置空待人工",
                )
                route.setdefault("provenance", {})["metrics"] = {
                    "source": "amap_webservice_walking", "verified": False,
                    "note": "road detour exceeds guard",
                }
                print(f"{rid:<16}{name:<18} ⚠ {round(total_km,1)}km 公路长途错引，置空")
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(route, f, ensure_ascii=False, indent=2)
                    f.write("\n")
                continue
            metrics["distance_km"] = round(total_km, 2)
            metrics["duration_hours"] = round(duration_s / 3600 * factor, 2)
            metrics["ascent_m"] = None  # 高德无高程数据，不编造
            metrics["verification_status"] = "verified_amap_walking"
            kind = "往返全程(2×起终点)" if factor == 2 else "单向全程"
            metrics["note"] = (
                f"distance_km/duration_hours 来自高德步行路径规划（{kind}，路网距离，真实可溯源）；"
                "ascent_m 高德无高程 API，暂缺，待 GPX/设备轨迹补充"
            )
            route.setdefault("provenance", {})["metrics"] = {
                "source": "amap_webservice_walking", "verified": True,
                "note": f"{kind} from amap walking route",
            }
        # 顺手存路网轨迹（仅供地图阶段参考，非真实山野轨迹）
        geom["amap_walking_path"] = polyline
        geom["amap_walking_note"] = "高德步行路网轨迹，非实地山野轨迹，仅供示意"
        ok += 1
        print(f"{rid:<16}{name:<18} {metrics['distance_km']}km / {metrics['duration_hours']}h / {len(polyline)}点")

        if not args.dry_run:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(route, f, ensure_ascii=False, indent=2)
                f.write("\n")

    if not args.dry_run:
        reindex(ROOT)
        print(f"\n✅ 完成，已回填 index.json（verified {ok}/{len(files)}）")
    else:
        print("\n(dry-run 未落盘)")


if __name__ == "__main__":
    main()
