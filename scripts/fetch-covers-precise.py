#!/usr/bin/env python3
"""精准检索 public/covers：以 Wikimedia Commons 分类（人工策展）为主，全文检索兜底。

每条线路给出：精确 Commons 分类(主) + 精确检索词(兜底)。
严格的实景过滤：横版、JPEG、高分辨率、排除 教堂/轮渡/老城/地图/夜景/建筑内部 等。
把每条线路的若干候选（带 URL/作者/许可）下载到 public/covers/_candidates/<route>/，
并生成 candidates.json，供人工逐张核验后定稿，避免“按关键词自动打分”造成的错配。
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COVERS = os.path.join(ROOT, "public", "covers")
CAND = os.path.join(COVERS, "_candidates")
UA = {"User-Agent": "hiking-h5-covers/2.0 (precise cover fetch; contact: dev@example.com)"}

INFOS = ("&prop=imageinfo&iiprop=url%7Cmime%7Csize%7Cextmetadata"
         "&iiurlwidth=960&format=json")

# (route_id, 精确 Commons 分类(主，可空), [全文检索兜底词])
ROUTES = [
    ("rt_0f11d5adde", "Category:Wutong Mountain", ["Wutong Mountain Shenzhen forest trail"]),
    ("rt_25467ecc4b", "Category:Baiyun Mountain (Guangzhou)", ["Baiyun Mountain Guangzhou scenery"]),
    ("rt_2a968de350", "Category:Sheshan", ["Sheshan National Forest Park Shanghai"]),
    ("rt_2acb0cb265", "Category:Daheishan", ["大黑山 大连", "Daheishan Dalian"]),
    ("rt_2bea529b93", "Category:Qingyuan Mountain", ["Qingyuan Mountain Quanzhou", "清源山 泉州"]),
    ("rt_364bf9eb1b", "Category:Purple Mountain", ["Purple Mountain Nanjing view", "紫金山 南京"]),
    ("rt_3d8424eee0", "Category:Lingyan Mountain", ["Lingyan Mountain Suzhou", "灵岩山 苏州"]),
    ("rt_43009bb866", "Category:Longquan Mountains", ["Longquan Mountain Chengdu", "龙泉山 成都"]),
    ("rt_466f2b8fa1", "Category:East Lake (Wuhan)", ["East Lake Wuhan scenery", "东湖 武汉"]),
    ("rt_4678d25ddf", "", ["南岸 黄桷古道", "黄桷古道", "Huangge Ancient Trail Chongqing"]),
    ("rt_47be0584bc", "Category:Wutong Mountain", ["Wutong Mountain Shenzhen view", "梧桐山 深圳"]),
    ("rt_58d3ba9fe6", "Category:Jiuxi", ["Jiuxi Yungiu Hangzhou stream forest", "九溪 杭州"]),
    ("rt_69ad86af20", "Category:Island Ring Road (Xiamen)", ["环岛路 厦门", "Xiamen Huandao Road", "Xiamen coastline"]),
    ("rt_74234b6c22", "Category:Fragrant Hills", ["Fragrant Hills Beijing autumn", "香山 北京"]),
    ("rt_7820cc9568", "Category:Mount Qingcheng", ["Mount Qingcheng Sichuan", "青城山"]),
    ("rt_80712393c2", "Category:Maluan Mountain", ["马峦山", "Maluan Mountain Shenzhen", "马峦山 瀑布"]),
    ("rt_91c8f35c6f", "Category:Guling (Fuzhou)", ["Kuliang Guling Fuzhou mountain", "鼓岭 福州"]),
    ("rt_9b3f1503f9", "Category:Fenghuangling", ["Fenghuangling Beijing", "凤凰岭 北京"]),
    ("rt_9eefe157ad", "Category:Kuaiji Mountain", ["Kuaiji Mountain Shaoxing", "会稽山 绍兴"]),
    ("rt_9fd376a47c", "Category:Tanglang Mountain", ["Tanglang Mountain Shenzhen", "塘朗山 深圳"]),
    ("rt_b09fe3cf57", "Category:Baoshi Hill", ["Baoshi Hill Hangzhou Baochu Pagoda", "宝石山 杭州"]),
    ("rt_b10bc91fcd", "Category:Sheshan", ["Sheshan National Forest Park Shanghai hill", "佘山 上海"]),
    ("rt_b162897e15", "", ["Tingxiling Ancient Post Road", "亭溪岭", "Tingxiling Ningbo"]),
    ("rt_b50311f063", "Category:Tianping Mountain (Suzhou)", ["天平山 苏州", "Tianping Shan Suzhou", "Tianping Mountain Suzhou"]),
    ("rt_d1d5266b5a", "Category:Lianhuashan Park", ["Lianhuashan Park Shenzhen greenway", "莲花山 深圳"]),
    ("rt_dfdbe1e1fc", "Category:Dashu Mountain", ["Dashushan Hefei", "大蜀山 合肥"]),
    ("rt_e7bacaceea", "Category:Baiwang Mountain", ["Baiwang Mountain Beijing", "百望山 北京"]),
    ("rt_ef4c43f0c8", "Category:Yuelu Mountain", ["Yuelu Mountain Changsha", "岳麓山 长沙"]),
    ("rt_f7398b8168", "Category:Longjing tea", ["Longjing tea plantation Hangzhou", "龙井 茶园 杭州"]),
    ("rt_f7df01a385", "Category:Mount Li", ["Mount Li Lishan Qinling", "骊山 西安"]),
    ("rt_fa6036eb1b", "Category:Lovers Road", ["情侣路 珠海", "Zhuhai Lovers Road", "珠海 情侣路 海岸"]),
    ("rt_fe00a24b51", "Category:Baoduzhai", ["Baoduzhai Mountain Hebei", "抱犊寨 河北"]),
    ("rt_ff585250a6", "Category:Xiaoyushan", ["Xiaoyushan Qingdao", "小鱼山 青岛"]),
]

# 实景黑名单：多为非山野实景（教堂/轮渡/老城/地图/夜景/建筑内部等）
BLACKLIST = ["map", "plan", "diagram", "logo", "stamp", "seal", "ticket", "chart", "drawing",
             "sketch", "icon", "sign", "poster", "brochure", "document",
             "station", "rail", "metro", "subway", "airport", "typhoon", "modis", "satellite",
             "government", "supermarket", "shop", "mall", "market", "statue", "sculpture",
             "interior", "night", "pit", "terracotta", "warrior", "grave", "tomb", "portrait",
             "basilica", "cathedral", "church", "chapel", "ferry", "pier", "wharf",
             "old town", "shibati", "downtown", "skyscraper", "facade", "plaza",
             "车站", "政府", "超市", "雕像", "夜景", "卫星", "台风", "殿",
             "改造图", "规划", "图纸", "地图", "平面图", "线路图", "老照片", "文物单位",
             "教堂", "轮渡", "码头", "老城", "城区夜景", "period", "dynasty", "bc "]
PREF = ["trail", "path", "steps", "stairs", "view", "peak", "valley", "forest", "tea", "stream",
        "lake", "coast", "beach", "mountain", "hill", "ridge", "pagoda", "temple", "park", "rock",
        "autumn", "maple", "bamboo", "waterfall"]

TAG = re.compile(r"<[^>]+>")


def strip_html(s: str) -> str:
    return TAG.sub("", s or "").strip()


def fetch(url: str, timeout: int = 30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def list_category(cat: str):
    url = ("https://commons.wikimedia.org/w/api.php?action=query"
           "&generator=categorymembers&gcmtitle=" + urllib.parse.quote(cat)
           + "&gcmtype=file&gcmlimit=60&gcmnamespace=14" + INFOS)
    url = ("https://commons.wikimedia.org/w/api.php?action=query"
           "&generator=categorymembers&gcmtitle=" + urllib.parse.quote(cat)
           + "&gcmtype=file&gcmlimit=60" + INFOS)
    try:
        data = json.loads(fetch(url).decode("utf-8"))
    except Exception as e:
        print(f"  category error ({cat}): {e}")
        return []
    return (data.get("query") or {}).get("pages") or {}


def search_term(term: str):
    url = ("https://commons.wikimedia.org/w/api.php?action=query&generator=search"
           "&gsrlimit=15&gsrnamespace=6" + INFOS + "&gsrsearch=" + urllib.parse.quote(term))
    try:
        data = json.loads(fetch(url).decode("utf-8"))
    except Exception as e:
        print(f"  search error ({term}): {e}")
        return []
    return (data.get("query") or {}).get("pages") or {}


def collect(pages):
    out = []
    for p in pages.values():
        infos = p.get("imageinfo") or []
        if not infos:
            continue
        info = infos[0]
        title = p.get("title", "")
        low = title.lower()
        if info.get("mime") != "image/jpeg":
            continue
        if any(b in low for b in BLACKLIST):
            continue
        w, h = info.get("width", 0), info.get("height", 0)
        if w < 800 or w <= h:  # 横版
            continue
        thumb = info.get("thumburl")
        if not thumb:
            continue
        meta = info.get("extmetadata") or {}
        credit = {
            "title": title,
            "artist": strip_html((meta.get("Artist") or {}).get("value", ""))[:120],
            "license": strip_html((meta.get("LicenseShortName") or {}).get("value", ""))[:40],
            "url": info.get("url", ""),
        }
        score = sum(1 for k in PREF if k in low)
        out.append((score, w, thumb, credit))
    # 优先：含户外关键词、再按分辨率
    out.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return out


def download(url: str, path: str, attempts: int = 4):
    last = None
    for i in range(attempts):
        try:
            blob = fetch(url)
            if blob[:2] == b"\xff\xd8" and len(blob) >= 15000:
                with open(path, "wb") as f:
                    f.write(blob)
                return True
        except Exception as e:
            last = e
        time.sleep(1.5 + i)
    if last:
        print(f"    download fail: {last}")
    return False


def slug(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", s)[:60].strip("_")


def main() -> int:
    os.makedirs(CAND, exist_ok=True)
    only = set(sys.argv[1:])
    by_id: dict[str, dict] = {}
    cj = os.path.join(CAND, "candidates.json")
    if os.path.exists(cj):
        try:
            for e in json.load(open(cj, encoding="utf-8")):
                by_id[e["route_id"]] = e
        except Exception:
            pass
    for route_id, cat, terms in ROUTES:
        if only and route_id not in only:
            continue
        items = []
        if cat:
            pages = list_category(cat)
            items = collect(pages)
            print(f"{route_id}: category《{cat}》-> {len(items)} 候选")
        if not items:
            for t in terms:
                items += collect(search_term(t))
            items.sort(key=lambda x: (x[0], x[1]), reverse=True)
            print(f"{route_id}: 检索兜底 -> {len(items)} 候选")
        if not items:
            print(f"  FAIL {route_id}: 无可用横版 JPEG")
            by_id[route_id] = {"route_id": route_id, "candidates": []}
            continue
        top = items[:4]
        d = os.path.join(CAND, route_id)
        os.makedirs(d, exist_ok=True)
        cands = []
        for idx, (score, w, thumb, credit) in enumerate(top, 1):
            fname = f"{idx:02d}_{slug(credit['title'])}.jpg"
            ok = download(thumb, os.path.join(d, fname))
            if not ok and credit.get("url"):
                ok = download(credit["url"], os.path.join(d, fname))
            if ok:
                cands.append({"file": fname, "score": score, "width": w,
                              "thumb": thumb, **credit})
        print(f"  -> 已下载 {len(cands)} 张候选到 _candidates/{route_id}/")
        by_id[route_id] = {"route_id": route_id, "category": cat, "candidates": cands}
        time.sleep(0.3)
    manifest = [by_id[r[0]] for r in ROUTES if r[0] in by_id]
    with open(cj, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print("---- done: 候选已生成，请人工核验后定稿 ----")
    return 0


if __name__ == "__main__":
    sys.exit(main())
