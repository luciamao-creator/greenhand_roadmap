#!/usr/bin/env python3
"""用 Wikimedia Commons 实拍图（按真实地名搜索）替换 public/covers 占位图。

- 每条线路配置主搜索词 + 备选词链，保证命中的是该线路真实所在地
- 仅选横版 JPEG，过滤地图/图纸/标志类文件
- 生成 public/covers/CREDITS.md 记录 文件名/作者/许可，满足 CC BY / CC BY-SA 署名要求
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
UA = {"User-Agent": "hiking-h5-covers/1.0 (one-time cover fetch; contact: dev@example.com)"}

API = ("https://commons.wikimedia.org/w/api.php?action=query&generator=search"
       "&gsrlimit=8&gsrnamespace=6&prop=imageinfo"
       "&iiprop=url%7Cmime%7Csize%7Cextmetadata&iiurlwidth=960&format=json")

# (route_id, [依次尝试的搜索词；前面的最准])
ROUTES = [
    ("rt_0f11d5adde", ["Shenzhen mountain forest", "Wutong Mountain", "Shenzhen park"]),
    ("rt_25467ecc4b", ["Maofeng Mountain", "Baiyun Mountain Guangzhou", "Guangzhou forest"]),
    ("rt_2a968de350", ["Sheshan Shanghai", "Songjiang Shanghai"]),
    ("rt_2acb0cb265", ["大黑山 大连", "Daheishan Dalian", "Dalian Binhai Road"]),
    ("rt_2bea529b93", ["Qingyuan Mountain Quanzhou", "Quanzhou mountain", "Quanzhou city view"]),
    ("rt_364bf9eb1b", ["Purple Mountain Nanjing", "Zijin Shan", "Nanjing forest"]),
    ("rt_3d8424eee0", ["Lingyan Mountain Suzhou", "Suzhou hill temple", "Suzhou mountain"]),
    ("rt_43009bb866", ["Longquan Mountain Chengdu", "Chengdu greenway", "Chengdu park forest"]),
    ("rt_466f2b8fa1", ["East Lake Wuhan", "Wuhan East Lake", "Wuhan lake"]),
    ("rt_4678d25ddf", ["黄葛古道 风景", "黄葛古道", "十八梯", "Chongqing stairs"]),
    ("rt_47be0584bc", ["Shenzhen mountain view", "Wutong Mountain view", "Shenzhen hills"]),
    ("rt_58d3ba9fe6", ["Jiuxi Hangzhou", "Hangzhou stream forest", "Longjing Hangzhou"]),
    ("rt_69ad86af20", ["Xiamen boardwalk", "Xiamen coastline", "Gulangyu view"]),
    ("rt_74234b6c22", ["Fragrant Hills Beijing", "Xiangshan Beijing", "Beijing autumn hill"]),
    ("rt_7820cc9568", ["Mount Qingcheng", "Qingcheng Shan"]),
    ("rt_80712393c2", ["Maluan Mountain Shenzhen", "Shenzhen waterfall", "Shenzhen stream"]),
    ("rt_91c8f35c6f", ["Kuliang Fuzhou", "Guling Fuzhou", "Fuzhou mountain"]),
    ("rt_9b3f1503f9", ["Fenghuangling Beijing", "Beijing granite mountain", "Beijing mountain"]),
    ("rt_9eefe157ad", ["Kuaiji Mountain", "Shaoxing East Lake", "Shaoxing hills"]),
    ("rt_9fd376a47c", ["Tanglang Mountain Shenzhen", "Shenzhen forest trail", "Shenzhen greenway"]),
    ("rt_b09fe3cf57", ["Baochu Pagoda", "West Lake Hangzhou view", "Baoshi Hill Hangzhou"]),
    ("rt_b10bc91fcd", ["Sheshan Shanghai", "Songjiang Shanghai"]),
    ("rt_b162897e15", ["Ningbo ancient trail", "Tiantai Ningbo", "Ningbo mountain"]),
    ("rt_b50311f063", ["Tianping Mountain Suzhou", "Suzhou Tianpingshan", "Suzhou maple"]),
    ("rt_d1d5266b5a", ["Shenzhen greenway", "Lianhuashan Shenzhen", "Shenzhen park"]),
    ("rt_dfdbe1e1fc", ["Dashushan Hefei", "Hefei forest", "Anhui hill park"]),
    ("rt_e7bacaceea", ["Baiwang Mountain Beijing", "Beijing autumn forest", "Beijing hill"]),
    ("rt_ef4c43f0c8", ["Yuelu Mountain", "Changshan Yuelu", "Changsha mountain"]),
    ("rt_f7398b8168", ["Longjing tea plantation", "Hangzhou tea terraces", "Hangzhou bamboo"]),
    ("rt_f7df01a385", ["骊山晚照", "Zhongnan Mountains", "秦岭", "Mount Li"]),
    ("rt_fa6036eb1b", ["Zhuhai Lovers Road", "Zhuhai coastline", "Zhuhai Jida"]),
    ("rt_fe00a24b51", ["Baoduzhai", "Taihang Mountains", "Hebei mountain fort"]),
    ("rt_ff585250a6", ["Xiaoyushan Qingdao", "Qingdao red roofs coast", "Qingdao coastline"]),
]

# 标题里出现这些词直接跳过（多为非实景：车站/卫星图/政府楼/超市/雕塑/夜景等）
BLACKLIST = ["map", "plan", "diagram", "logo", "stamp", "seal", "ticket", "chart", "drawing",
             "sketch", "icon", "sign", "poster", "cover page", "brochure", "document",
             "station", "rail", "metro", "subway", "airport", "typhoon", "modis", "satellite",
             "government", "supermarket", "shop", "mall", "market", "statue", "sculpture",
             "interior", "night", "pit", "terracotta", "warrior", "grave", "tomb", "portrait",
             "车站", "政府", "超市", "雕像", "夜景", "卫星", "台风", "殿",
             "改造图", "规划", "图纸", "地图", "平面图", "线路图", "老照片", "文物单位",
             "period", "dynasty", "bc "]
# 标题出现加分（更可能是户外实景）
PREF = ["trail", "path", "steps", "stairs", "view", "peak", "valley", "forest", "tea", "stream",
        "lake", "coast", "beach", "mountain", "hill", "ridge", "pagoda", "temple", "park", "rock"]

TAG = re.compile(r"<[^>]+>")


def strip_html(s: str) -> str:
    return TAG.sub("", s or "").strip()


def fetch(url: str, timeout: int = 30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def search(term: str):
    q = API + "&gsrsearch=" + urllib.parse.quote(term)
    try:
        data = json.loads(fetch(q).decode("utf-8"))
    except Exception as e:
        print(f"  search error: {e}")
        return []
    pages = (data.get("query") or {}).get("pages") or {}
    items = []
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
        if w < 700 or w <= h:  # 只要横版
            continue
        thumb = info.get("thumburl")
        if not thumb:
            continue
        meta = info.get("extmetadata") or {}
        credit = {
            "title": title,
            "artist": strip_html((meta.get("Artist") or {}).get("value", ""))[:120],
            "license": strip_html((meta.get("LicenseShortName") or {}).get("value", ""))[:40],
            "page": strip_html((meta.get("Credit") or {}).get("value", ""))[:160],
        }
        score = sum(2 for k in PREF if k in low)
        items.append((score, thumb, credit))
    items.sort(key=lambda x: -x[0])
    return items


def pick(items, used_titles):
    """优先：未用过 + 含户外关键词(score>=2)；其次未用过；最后允许复用。items 已按分排序。"""
    for group in (
        [i for i in items if i[0] >= 2 and i[2]["title"] not in used_titles],
        [i for i in items if i[2]["title"] not in used_titles],
        [i for i in items if i[0] >= 2],
        items,
    ):
        if group:
            return group[0]
    return None


def fetch_retry(url: str, attempts: int = 2):
    last = None
    for i in range(attempts):
        try:
            return fetch(url)
        except Exception as e:
            last = e
            time.sleep(1.0)
    raise last


def main() -> int:
    os.makedirs(COVERS, exist_ok=True)
    credits: list[str] = ["# 封面图版权与来源（Wikimedia Commons）", "",
                          "封面来自 Wikimedia Commons 实拍图，依各图许可署名如下（CC BY / CC BY-SA 需保留署名）：", ""]
    used_titles: set[str] = set()
    ok = fail = 0
    for route_id, terms in ROUTES:
        out = os.path.join(COVERS, route_id + ".jpg")
        chosen = None
        for term in terms:
            pool = search(term)
            while pool:
                top = pick(pool, used_titles)
                if top is None:
                    break
                _, thumb, credit = top
                try:
                    blob = fetch_retry(thumb)
                except Exception as e:
                    print(f"  download error {route_id}: {e}")
                    blob = None
                if blob and len(blob) >= 15000 and blob[:2] == b"\xff\xd8":
                    chosen = (term, credit, blob)
                    break
                # 该候选不可用，剔除后重选
                pool = [p for p in pool if p[2]["title"] != credit["title"]]
            if chosen:
                break
            time.sleep(0.4)
        if not chosen:
            print(f"FAIL {route_id}（所有备选词均无可用横版 JPEG）")
            fail += 1
            continue
        term, credit, blob = chosen
        with open(out, "wb") as f:
            f.write(blob)
        used_titles.add(credit["title"])
        credits.append(f"- `{route_id}.jpg` ← Commons《{credit['title']}》 作者：{credit['artist'] or '未知'}，"
                       f"许可：{credit['license'] or '见文件页'}，搜索词：{term}")
        print(f"OK   {route_id}  [{term}]  {credit['title']}")
        ok += 1
        time.sleep(0.4)
    with open(os.path.join(COVERS, "CREDITS.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(credits) + "\n")
    print(f"---- done: ok={ok} fail={fail} ----")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
