#!/usr/bin/env python3
"""下载真实风景照替换线路封面占位 SVG。

- 为每条 data/routes/<id>.json 挑选与路线类型匹配的风景关键词（LoremFlickr 真实照片）。
- 下载到 public/covers/<id>.jpg，并把 cover_image 字段改为该路径。
- 下载失败自动回退到 nature 关键词；仍失败则保留原 SVG 不变。
"""
import json
import os
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COVERS = os.path.join(ROOT, "public", "covers")
DATA = os.path.join(ROOT, "data", "routes")
INDEX = os.path.join(DATA, "index.json")
UA = {"User-Agent": "Mozilla/5.0 (compatible; cover-fetch/1.0)"}


def keywords_for(name: str) -> str:
    if "瀑布" in name:
        return "waterfall"
    if "湖" in name:
        return "lake"
    if "海" in name or "滨海" in name or "海岸" in name or "岛" in name:
        return "coast"
    if "竹" in name:
        return "bamboo"
    if "古道" in name or "绿道" in name or "步道" in name or "登山" in name:
        return "trail"
    if "岭" in name or "峰" in name or "山" in name:
        return "mountain"
    return "forest"


def download(url: str, dest: str) -> bool:
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read()
    except Exception as exc:  # noqa: BLE001
        print(f"  download failed: {exc}")
        return False
    if len(data) < 6000:
        return False
    with open(dest, "wb") as fh:
        fh.write(data)
    return True


def main() -> None:
    os.makedirs(COVERS, exist_ok=True)
    with open(INDEX, encoding="utf-8") as fh:
        routes = json.load(fh)["routes"]

    updated = 0
    for i, r in enumerate(routes):
        rid = r["route_id"]
        name = r.get("route_name", "")
        kw = keywords_for(name)
        dest = os.path.join(COVERS, f"{rid}.jpg")
        lock = i + 17

        ok_ = download(f"https://loremflickr.com/800/600/{kw}?lock={lock}", dest)
        if not ok_:
            ok_ = download(f"https://loremflickr.com/800/600/nature?lock={lock}", dest)

        if not ok_ or os.path.getsize(dest) < 6000:
            print(f"SKIP {rid} ({name}): photo unavailable, keep svg")
            continue

        jp = os.path.join(DATA, f"{rid}.json")
        if os.path.exists(jp):
            with open(jp, encoding="utf-8") as fh:
                obj = json.load(fh)
            obj["cover_image"] = f"/covers/{rid}.jpg"
            with open(jp, "w", encoding="utf-8") as fh:
                json.dump(obj, fh, ensure_ascii=False, indent=2)
        updated += 1
        print(f"OK   {rid} ({name}) -> {kw}")

    print(f"\nupdated {updated}/{len(routes)} covers")


if __name__ == "__main__":
    main()
