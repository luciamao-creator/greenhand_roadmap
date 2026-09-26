#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fix-geometry.py —— 修复「起终点坐标重合」的非环线

问题来源
--------
sync-geometry.py 用地址型地理编码解析终点时，对「头陀岭公园 / 鬼笑石 / 龙门石窟」
这类 POI 型终点常常回落到起点所在的村/景区中心，导致起终点坐标几乎重合，
下游 sync-metrics 据此算出的路网距离≈0，无法得到真实里程。

修复策略（POI 优先 + 严格校验）
----
- 对重合的非环线，改用「POI 搜索优先」重新解析起、终点；
- 严格城市校验：POI 返回城市必须与 base_facts.city_name 一致，否则拒绝
  （避免「龙门石窟」被解析到洛阳）；
- 名称关联：POI 名必须包含起终点专名片段，否则拒绝
  （避免「白鹤山观景平台」被解析到紫霞山）；
- 分离护栏：解析后起终点必须相距 > 300m，否则判定仍重合、交人工/剔除。

用法
----
    python3 scripts/fix-geometry.py --dry-run        # 只诊断，不落盘
    python3 scripts/fix-geometry.py --apply           # 写入可分开的坐标；分不清的标 unresolved
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
GEOCODE_URL = "https://restapi.amap.com/v3/geocode/geo"
POI_URL = "https://restapi.amap.com/v3/place/text"
REQUEST_INTERVAL = 0.4
MIN_SEPARATION_M = 300       # 起终点最小可信间距（米）
MAX_SEPARATION_M = 50_000    # 单段徒步不可能 >50km，超出即跨市错配


def load_env(path):
    env = {}
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def haversine_m(a, b):
    import math
    r = 6371000.0
    lat1, lat2 = math.radians(a["lat"]), math.radians(b["lat"])
    dlat = lat2 - lat1
    dlng = math.radians(b["lng"] - a["lng"])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def call(url, key):
    last = None
    for _ in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "fix-geometry/1.0"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode("utf-8")), None
        except Exception as e:
            last = f"{type(e).__name__}: {e}"
            time.sleep(1.0)
    return None, last


def name_matches(got, expect):
    if not got or not expect:
        return False
    got, expect = str(got).strip(), str(expect).strip()
    return got == expect or got.startswith(expect) or expect.startswith(got)


GENERIC_SUFFIXES = ["游客中心", "游客服务中心", "服务中心", "观景台", "售票处", "大门",
                    "入口", "东门", "西门", "南门", "北门", "停车场", "驿站", "登山口",
                    "牌坊", "广场", "起点", "终点", "遗址", "公园", "景区", "风景区"]


def specific_core(target):
    for suf in GENERIC_SUFFIXES:
        if target.endswith(suf) and len(target) - len(suf) >= 2:
            return target[: -len(suf)]
    return target


def name_related(poi_name, target, address=""):
    probe = specific_core(target)
    if len(probe) < 2:
        probe = target
    grams = set()
    for n in (2, 3, 4):
        if n > len(probe):
            continue
        grams |= {probe[i:i + n] for i in range(len(probe) - n + 1)}
    if any(g in poi_name for g in grams):
        return True
    return bool(address) and any(g in address for g in grams)


def resolve_poi(target, city, key):
    """POI 优先解析。返回 (coord, detail) 或 (None, reason)。严格城市 + 名称关联。"""
    probes = [target, specific_core(target)]
    for q in probes:
        if not q:
            continue
        time.sleep(REQUEST_INTERVAL)
        params = urllib.parse.urlencode({"keywords": q, "city": city, "offset": "5",
                                         "page": "1", "key": key})
        body, err = call(f"{POI_URL}?{params}", key)
        if err or not body or body.get("status") != "1":
            continue
        for poi in body.get("pois", []):
            loc = poi.get("location") or ""
            if "," not in loc:
                continue
            lng_s, lat_s = loc.split(",", 1)
            try:
                lng, lat = float(lng_s), float(lat_s)
            except ValueError:
                continue
            poi_city = poi.get("cityname") or city
            poi_name = poi.get("name") or ""
            poi_addr = poi.get("address") or ""
            if not name_matches(poi_city, city):
                continue
            if not name_related(poi_name, target, poi_addr):
                continue
            return ({"lng": round(lng, 6), "lat": round(lat, 6)},
                    {"method": "poi_search", "query": q, "matched_name": poi_name,
                     "matched_address": poi_addr, "type": poi.get("type")})
    return None, f"POI 未命中（{target}@{city}）"


def resolve_geocode(target, city, key):
    time.sleep(REQUEST_INTERVAL)
    params = urllib.parse.urlencode({"address": target, "city": city, "key": key})
    body, err = call(f"{GEOCODE_URL}?{params}", key)
    if err or not body or body.get("status") != "1":
        return None, err or "geocode fail"
    for gc in body.get("geocodes", []):
        loc = gc.get("location") or ""
        if "," not in loc:
            continue
        lng_s, lat_s = loc.split(",", 1)
        try:
            lng, lat = float(lng_s), float(lat_s)
        except ValueError:
            continue
        return ({"lng": round(lng, 6), "lat": round(lat, 6)},
                {"method": "geocode", "matched_address": gc.get("formatted_address"),
                 "level": gc.get("level")})
    return None, "geocode no result"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not (args.dry_run or args.apply):
        args.dry_run = True

    env = load_env(os.path.join(ROOT, ".env.local"))
    key = env.get("AMAP_WEB_SERVICE_KEY", "")
    if not key:
        print("❌ 缺少 AMAP_WEB_SERVICE_KEY"); sys.exit(1)

    files = sorted(glob.glob(os.path.join(ROOT, "data", "routes", "rt_*.json")))
    fixed, unresolved, skipped = 0, 0, 0
    for path in files:
        d = json.load(open(path, encoding="utf-8"))
        bf = d.get("base_facts", {})
        if bf.get("route_type") == "loop":
            continue  # 环线由上层统一剔除，本脚本不管
        geom = d.get("geometry", {})
        sp, ep = geom.get("start_point"), geom.get("end_point")
        if not (sp and ep):
            continue
        if haversine_m(sp, ep) >= MIN_SEPARATION_M:
            skipped += 1
            continue  # 本来就不重合，不动

        name = bf.get("route_name", "?")
        city = bf.get("city_name", "")
        sn, en = bf.get("start_point_name"), bf.get("end_point_name")

        new_s, ds = resolve_poi(sn, city, key) or (None, "poi fail")
        if not new_s:
            new_s, ds = resolve_geocode(sn, city, key)
        new_e, de = resolve_poi(en, city, key) or (None, "poi fail")
        if not new_e:
            new_e, de = resolve_geocode(en, city, key)

        if not (new_s and new_e):
            print(f"{name:<16} ❌ 无法解析：起{ds} / 终{de}")
            unresolved += 1
            continue
        sep = haversine_m(new_s, new_e)
        if sep < MIN_SEPARATION_M or sep > MAX_SEPARATION_M:
            print(f"{name:<16} ⚠ 仍重合或跨市错配（{round(sep)}m）：起{new_s} 终{new_e}")
            unresolved += 1
            continue

        print(f"{name:<16} ✅ 起{new_s} 终{new_e} 间距{round(sep)}m")
        fixed += 1
        if args.apply:
            geom["start_point"] = new_s
            geom["end_point"] = new_e
            geom["geocode_status"] = "ok"
            geom["geocode_detail"] = {
                "start": {"status": "ok", **ds},
                "end": {"status": "ok", **de},
                "provider": "amap-webservice-poi-first",
                "synced_at": datetime.now(timezone.utc).isoformat(),
            }
            d.setdefault("provenance", {})["geometry"] = {
                "source": "amap_webservice_poi_first", "verified": True,
                "note": "re-resolved via POI-first to separate coincident endpoints",
            }
            json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
            open(path, "a", encoding="utf-8").write("\n")

    print(f"\n合计：fixed={fixed}  unresolved={unresolved}  skipped(本就不重合)={skipped}")
    if args.dry_run:
        print("(dry-run，未落盘；加 --apply 写入)")


if __name__ == "__main__":
    main()
