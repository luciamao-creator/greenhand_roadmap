#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync-geometry.py —— 用高德 Web服务 API 回填线路起终点真实坐标

背景
----
data/routes/rt_*.json 的 geometry.note 写着一条硬约束：
    「坐标必须由高德 Web服务 API 回填，禁止在未核验前写入任何坐标」

所以本脚本不做「拿到坐标就写」，而是先核验再写。两条核验规则：
  1. 省市一致性：API 返回的 province / city 必须与 base_facts 里的
     province_name / city_name 一致，否则判定为「打飞了」，拒绝写入。
  2. 精度下限：返回地址等级不能过粗。省 / 城市 / 区县 级只是行政中心，
     不是徒步起终点，判定为 coarse，同样拒绝写入。

只有通过核验的坐标才会落盘，未通过的保持 null 并在 geocode_detail 里
记下原因，方便人工补。

用法
----
    python3 scripts/sync-geometry.py --dry-run --limit 5   # 试跑，不落盘
    python3 scripts/sync-geometry.py --limit 5             # 先跑 5 条
    python3 scripts/sync-geometry.py                       # 全量 40 条
    python3 scripts/sync-geometry.py --force               # 忽略已 ok 的，重跑
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

# 精度门槛：只有这些等级才可能是真实的徒步起终点。
#
# 这里用「白名单」而不是「黑名单」。原因是一次实测教训：
# 黑名单里写了「城市」，但高德对「大连唐王殿遗址」返回的 level 字面值是「市」，
# 没被拦住，结果把大连市中心（距真实位置 25km）当成了终点写进去。
# 白名单的好处：没见过的等级一律不信任，而不是一律放行。
FINE_LEVELS = {"兴趣点", "门牌号", "道路", "交叉口", "村庄", "景点", "风景名胜"}

# 高德对个人开发者有 QPS 限制，两次请求之间留出间隔
REQUEST_INTERVAL = 0.4


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


def geocode(address, city, key, retries=3):
    """调用高德地理编码。返回 (geocodes列表, 错误信息)。

    注意：高德的失败藏在 HTTP 200 里（JSON status="0"），
    只看 HTTP 状态码会误判成功。
    """
    params = urllib.parse.urlencode({"address": address, "city": city, "key": key})
    url = f"{GEOCODE_URL}?{params}"

    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "route-geometry-sync/1.0"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code}"
        except Exception as e:  # 网络抖动、超时
            last_err = f"{type(e).__name__}: {e}"
        else:
            if body.get("status") == "1":
                return body.get("geocodes", []), None
            # 业务层失败：把 info / infocode 原样带出来，便于定位
            return [], f'{body.get("info")} (infocode={body.get("infocode")})'
        time.sleep(1.0 * (attempt + 1))
    return [], last_err or "未知错误"


def poi_search(keyword, city, key, retries=3):
    """高德 POI 搜索（place/text）。

    徒步起终点本质是 POI（景点、公园门口、登山口），不是门牌地址，
    用地址型地理编码经常只能落到区县中心，所以这里补一路 POI 兜底。
    """
    params = urllib.parse.urlencode(
        {"keywords": keyword, "city": city, "offset": "5", "page": "1", "key": key}
    )
    url = f"https://restapi.amap.com/v3/place/text?{params}"

    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "route-geometry-sync/1.0"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code}"
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
        else:
            if body.get("status") == "1":
                return body.get("pois", []), None
            return [], f'{body.get("info")} (infocode={body.get("infocode")})'
        time.sleep(1.0 * (attempt + 1))
    return [], last_err or "未知错误"


def name_matches(got, expect):
    """宽松匹配行政名：'成都市' vs '成都'、'四川省' vs '四川' 都算一致。"""
    if not got or not expect:
        return False
    got, expect = str(got).strip(), str(expect).strip()
    if got == expect:
        return True
    return got.startswith(expect) or expect.startswith(got)


# 通用后缀：徒步起终点的名称里，这些词没有区分度，
# 必须剥掉它们、用剩下的「专名」去匹配，否则会匹配到任何同名通用设施。
# 例：「龙脊天路游客中心」→ 专名「龙脊天路」；匹配到「三圣花乡游客中心」就该拒绝。
GENERIC_SUFFIXES = [
    "游客中心", "游客服务中心", "服务中心", "观景台", "售票处", "大门",
    "入口", "东门", "西门", "南门", "北门", "停车场", "驿站", "登山口",
    "牌坊", "广场", "起点", "终点", "遗址",
]


def specific_core(target):
    """剥掉通用后缀，返回有区分度的专名。剥不动就原样返回。"""
    for suf in GENERIC_SUFFIXES:
        if target.endswith(suf) and len(target) - len(suf) >= 2:
            return target[: -len(suf)]
    return target


def name_related(poi_name, target, address=""):
    """判断 POI 名称与目标地点是否相关。

    用「专名」而非全名去比对：否则「龙脊天路游客中心」会命中任何「游客中心」，
    把坐标写到几十公里外的同名设施上。要求专名里出现过的连续汉字片段（2~4 字）
    落在 POI 名称或地址中才认。
    """
    if not poi_name or not target:
        return False
    probe = specific_core(target)
    if len(probe) < 2:
        probe = target
    grams = set()
    for n in (2, 3, 4):
        if n > len(probe):
            continue
        grams |= {probe[i : i + n] for i in range(len(probe) - n + 1)}
    if any(g in poi_name for g in grams):
        return True
    return bool(address) and any(g in address for g in grams)


def resolve_point(facts, key, which, start_coord=None):
    """解析一个点（start / end）。返回 (坐标dict或None, 状态, 详情)。"""
    city = facts.get("city_name", "")
    area = facts.get("area_name", "")
    target = facts.get(f"{which}_point_name") or ""
    keyword = facts.get("map_search_keyword") or ""

    # 候选查询串：从精确到宽泛依次尝试
    candidates = []
    if target:
        candidates.append(f"{city}{area}{target}")
        candidates.append(f"{city}{target}")
    if keyword:
        candidates.append(keyword)
        candidates.append(f"{city}{keyword}")

    reject_reason = None
    loose = None

    # ---- 第一阶段：地址型地理编码 ----
    # 关键点：某个候选词返回「粗结果/省市不符」时不能就此判死，
    # 必须继续试后面的候选词，否则会把可解析的点误杀。
    for q in candidates:
        if not q:
            continue
        time.sleep(REQUEST_INTERVAL)
        gcs, err = geocode(q, city, key)

        if err:
            reject_reason = reject_reason or f"地理编码失败：{err}"
            continue
        if not gcs:
            reject_reason = reject_reason or f"地理编码无结果（{q}）"
            continue

        top = gcs[0]
        location = top.get("location") or ""
        if "," not in location:
            continue

        lng_s, lat_s = location.split(",", 1)
        try:
            lng, lat = float(lng_s), float(lat_s)
        except ValueError:
            continue

        level = top.get("level") or ""
        province = top.get("province") or ""
        got_city = top.get("city") or city
        district = top.get("district") or ""

        # 核验 1：省市一致性 —— 防止把「北京西山」当成「成都西山」写进去
        if not (name_matches(province, facts.get("province_name", "")) and name_matches(got_city, city)):
            reject_reason = reject_reason or (
                f"省市不匹配：期望 {facts.get('province_name')}/{city}，实际 {province}/{got_city}"
            )
            continue

        # 核验 2：精度下限（白名单）
        if level not in FINE_LEVELS:
            reject_reason = reject_reason or f"地址等级不可信（{level}），可能只是行政中心"
            continue

        # 核验 3：区县缺失 —— 挡掉区县字段为空的结果
        # （实测：城市中心点的 district 是空的，靠这条兜住）
        if area and not district:
            reject_reason = reject_reason or f"返回缺少区县信息（level={level}），无法核验"
            continue

        geo_detail = {
            "method": "geocode",
            "query": q,
            "matched_address": top.get("formatted_address"),
            "level": level,
            "returned_province": province,
            "returned_city": got_city,
            "returned_district": district,
            "candidate_count": len(gcs),
        }
        coord = {"lng": round(lng, 6), "lat": round(lat, 6)}

        # 护栏：终点坐标与起点几乎重合（<100m），说明高德把山顶/村内景点
        # 解析回了公园入口的同一点，不能作为有效终点，继续尝试后续候选词。
        if start_coord and haversine_km(coord, start_coord) < 0.1:
            reject_reason = reject_reason or "终点坐标与起点过近（<100m），疑似解析重合"
            continue

        # 核验 4：区县级 —— 防止同城不同区的同名点。
        # 但跨区不等于错配（东湖绿道这类线路本就横跨武昌/洪山），
        # 所以这里不当场判死，只降级为次选项：若所有候选都跨区，取第一个并标记待确认。
        if area and district and not name_matches(district, area):
            geo_detail["district_note"] = f"跨区：期望 {area}，实际 {district}"
            if loose is None:
                loose = (coord, geo_detail)
            continue

        status = "ok" if len(gcs) == 1 else "ambiguous"
        return coord, status, geo_detail

    # 所有候选都跨区时，退回次选项，并标记待人工确认
    if loose:
        return loose[0], "cross_district", loose[1]

    # ---- 第二阶段：POI 搜索兜底 ----
    poi_candidates = []
    if target:
        poi_candidates.append(f"{area}{target}")
        poi_candidates.append(target)
    if keyword:
        poi_candidates.append(keyword)

    loose = None
    for q in poi_candidates:
        if not q:
            continue
        time.sleep(REQUEST_INTERVAL)
        pois, err = poi_search(q, city, key)

        if err:
            reject_reason = reject_reason or f"POI 搜索失败：{err}"
            continue
        if not pois:
            reject_reason = reject_reason or f"POI 搜索无结果（{q}）"
            continue

        for poi in pois:
            location = poi.get("location") or ""
            if "," not in location:
                continue
            lng_s, lat_s = location.split(",", 1)
            try:
                lng, lat = float(lng_s), float(lat_s)
            except ValueError:
                continue

            poi_name = poi.get("name") or ""
            poi_city = poi.get("cityname") or city
            poi_addr = poi.get("address") or ""
            poi_district = poi.get("adname") or ""

            if not name_matches(poi_city, city):
                reject_reason = reject_reason or f"POI 城市不匹配：{poi_city}"
                continue
            if not name_related(poi_name, target, poi_addr):
                reject_reason = reject_reason or f"POI 名称与「{target}」无关：{poi_name}"
                continue

            poi_detail = {
                "method": "poi_search",
                "query": q,
                "matched_name": poi_name,
                "matched_address": poi_addr,
                "poi_type": poi.get("type"),
                "returned_city": poi_city,
                "returned_district": poi_district,
                "candidate_count": len(pois),
            }
            coord = {"lng": round(lng, 6), "lat": round(lat, 6)}

            # 护栏：同 geocode 阶段，终点与起点近乎重合时拒绝，继续尝试其他 POI
            if start_coord and haversine_km(coord, start_coord) < 0.1:
                reject_reason = reject_reason or "POI 坐标与起点过近（<100m），疑似解析重合"
                continue

            if area and poi_district and not name_matches(poi_district, area):
                poi_detail["district_note"] = f"跨区：期望 {area}，实际 {poi_district}"
                if loose is None:
                    loose = (coord, poi_detail)
                continue

            return coord, "ok", poi_detail

    if loose:
        return loose[0], "cross_district", loose[1]

    return None, "no_result", {"reject_reason": reject_reason or "无可用候选词"}


def haversine_km(a, b):
    """两点球面直线距离（公里）。用于发现「起终点相距异常远」这类错配。"""
    import math

    r = 6371.0
    lat1, lat2 = math.radians(a["lat"]), math.radians(b["lat"])
    dlat = lat2 - lat1
    dlng = math.radians(b["lng"] - a["lng"])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def overall_status(s_status, e_status):
    accepted = ("ok", "ambiguous", "cross_district")
    s_ok, e_ok = s_status in accepted, e_status in accepted
    if s_ok and e_ok:
        # 跨区写入不算错，但要单独标出来，方便人工抽查
        if "cross_district" in (s_status, e_status):
            return "ok_cross_district"
        return "ok"
    if s_ok or e_ok:
        return "partial"
    return "failed"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="只处理前 N 条（0 表示全部）")
    ap.add_argument("--dry-run", action="store_true", help="只打印结果，不写文件")
    ap.add_argument("--force", action="store_true", help="忽略已有的 ok 状态，强制重跑")
    args = ap.parse_args()

    env = load_env(os.path.join(ROOT, ".env.local"))
    key = env.get("AMAP_WEB_SERVICE_KEY", "")
    if not key:
        print("❌ .env.local 里没有 AMAP_WEB_SERVICE_KEY，或值为空")
        sys.exit(1)

    files = sorted(glob.glob(os.path.join(ROOT, "data", "routes", "rt_*.json")))
    if args.limit:
        files = files[: args.limit]

    print(f"待处理 {len(files)} 条线路{'（dry-run 不落盘）' if args.dry_run else ''}\n")
    print(f"{'route_id':<16}{'线路名':<18}{'起点':<12}{'终点':<12}坐标")
    print("-" * 92)

    results = []
    for path in files:
        with open(path, encoding="utf-8") as f:
            route = json.load(f)

        facts = route.get("base_facts", {})
        geom = route.setdefault("geometry", {})
        rid = route.get("route_id", os.path.basename(path))
        name = facts.get("route_name", "?")

        if geom.get("geocode_status") == "ok" and not args.force:
            print(f"{rid:<16}{name:<18}{'已ok 跳过':<12}")
            results.append({"route_id": rid, "status": "skipped"})
            continue

        s_coord, s_status, s_detail = resolve_point(facts, key, "start")
        e_coord, e_status, e_detail = resolve_point(facts, key, "end", s_coord)

        # 距离护栏：一条步道两端不可能相隔 50km 以上。
        # 若跨度过大且某个点来自「跨区」降级匹配（最不可信），就把该点清空交人工，
        # 避免把明显打飞的坐标写进数据。
        _span_pre = None
        if s_coord and e_coord:
            _span_pre = round(haversine_km(s_coord, e_coord), 1)
        if _span_pre and _span_pre > 25:
            if s_status == "cross_district" and e_status != "cross_district":
                s_coord, s_status = None, "far_review"
                s_detail = {**s_detail, "far_note": f"与已确认终点相距 {_span_pre}km，已置空待人工"}
            elif e_status == "cross_district" and s_status != "cross_district":
                e_coord, e_status = None, "far_review"
                e_detail = {**e_detail, "far_note": f"与已确认起点相距 {_span_pre}km，已置空待人工"}
            elif "cross_district" in (s_status, e_status):
                s_coord, e_coord = None, None
                s_status, e_status = "far_review", "far_review"

        status = overall_status(s_status, e_status)

        # 只有通过核验的坐标才写入；未通过的保持 null
        if s_coord:
            geom["start_point"] = s_coord
        if e_coord:
            geom["end_point"] = e_coord
        geom["geocode_status"] = status
        geom["geocode_detail"] = {
            "start": {"status": s_status, **s_detail},
            "end": {"status": e_status, **e_detail},
            "provider": "amap-webservice-geocode-v3",
            "synced_at": datetime.now(timezone.utc).isoformat(),
        }

        sp = f"{s_coord['lng']},{s_coord['lat']}" if s_coord else f"—{s_status}"
        ep = f"{e_coord['lng']},{e_coord['lat']}" if e_coord else f"—{e_status}"

        span_km = None
        warn = ""
        if s_coord and e_coord:
            span_km = round(haversine_km(s_coord, e_coord), 1)
            if span_km > 30:
                warn = f"  ⚠ 两端直线相距 {span_km}km，疑似错配"
        print(f"{rid:<16}{name:<18}{s_status:<12}{e_status:<12}{sp} → {ep}{warn}")

        results.append(
            {
                "route_id": rid,
                "route_name": name,
                "status": status,
                "span_km": span_km,
                "start": {"status": s_status, "coord": s_coord, "detail": s_detail},
                "end": {"status": e_status, "coord": e_coord, "detail": e_detail},
            }
        )

        if not args.dry_run:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(route, f, ensure_ascii=False, indent=2)
                f.write("\n")

    # 汇总
    from collections import Counter

    print("\n" + "=" * 92)
    print("汇总：", dict(Counter(r["status"] for r in results)))

    far = [r for r in results if (r.get("span_km") or 0) > 30]
    if far:
        print("\n起终点直线相距 >30km，需人工确认是否真有这么长：")
        for r in far:
            print(f"  {r['route_id']}  {r['route_name']}  {r['span_km']}km")

    bad = [r for r in results if r["status"] in ("failed", "partial")]
    if bad:
        print("\n需要人工补的线路：")

        def why(detail):
            return (
                detail.get("reject_reason")
                or detail.get("far_note")
                or detail.get("district_note")
                or detail.get("status")
            )

        for r in bad:
            s = why(r.get("start", {}).get("detail", {}))
            e = why(r.get("end", {}).get("detail", {}))
            print(f"  {r['route_id']}  {r.get('route_name')}")
            print(f"      起点: {s}")
            print(f"      终点: {e}")

    if not args.dry_run:
        os.makedirs(os.path.join(ROOT, "logs"), exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        report = os.path.join(ROOT, "logs", f"geometry-sync-{ts}.json")
        with open(report, "w", encoding="utf-8") as f:
            json.dump({"synced_at": ts, "count": len(results), "results": results}, f, ensure_ascii=False, indent=2)
        print(f"\n报告已写入 {os.path.relpath(report, ROOT)}")


if __name__ == "__main__":
    main()
