#!/usr/bin/env python3
"""
为 33 条真实线路生成「实景风」SVG 封面大图，落盘到 public/covers/<route_id>.svg，
并在 data/routes/<id>.json 写入 cover_image 字段。

设计：
- 季节决定天空与山体配色（春绿 / 夏浓 / 秋暖 / 冬冷）；
- surface_tags 含 湖/海/溪/绿道/江 等则底部加水面倒影；
- 由 route_id 播种的伪随机山脊线，保证每条线路封面各异且稳定。

这是离线、无需外部 AK 的封面方案；后续接入真实照片只需把 cover_image 改为照片路径即可。
"""
import json
import glob
import hashlib
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "covers")
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "routes")


def rng(seed: str):
    h = int(hashlib.md5(seed.encode()).hexdigest(), 16)
    state = [h]

    def n():
        state[0] = (state[0] * 1103515245 + 12345) & 0x7FFFFFFF
        return state[0] / 0x7FFFFFFF

    return n


PALETTES = {
    "春季": ("#cfe8f3", "#eaf6ee", ["#6fae8b", "#4e8f6e", "#356b52"]),
    "夏季": ("#bfe0f2", "#e8f6ee", ["#5aa06f", "#3c8a5a", "#2a6b46"]),
    "秋季": ("#f3e2c7", "#f6efe2", ["#c9a36b", "#a9854f", "#7d5f38"]),
    "冬季": ("#dfe7ee", "#f2f5f8", ["#9fb0a6", "#7d9189", "#5d7268"]),
}


def has_water(surfs):
    return any(k in (surfs or "") for k in ["湖", "海", "溪", "绿道", "江", "河", "湿地", "栈道"])


def build_svg(route_id, season, surfs):
    r = rng(route_id)
    sky_top, sky_bottom, hills = PALETTES.get(season, PALETTES["春季"])
    water = has_water(surfs)

    def ridge(base_y, amp, color):
        pts = []
        x = 0
        pts.append(f"M0,{base_y}")
        while x <= 800:
            y = base_y - amp * (0.5 + 0.5 * abs(__import__("math").sin(x * (0.004 + 0.003 * r()) + r() * 6)))
            pts.append(f"L{x:.0f},{y:.0f}")
            x += 40 + int(r() * 30)
        pts.append(f"L800,500 L0,500 Z")
        return f'<path d="{" ".join(pts)}" fill="{color}"/>'

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">',
        f'<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{sky_top}"/><stop offset="1" stop-color="{sky_bottom}"/></linearGradient></defs>',
        f'<rect width="800" height="500" fill="url(#sky)"/>',
        f'<circle cx="{620 + int(r()*60)}" cy="{90 + int(r()*40)}" r="{34 + int(r()*18)}" fill="#fff7e0" opacity="0.85"/>',
        ridge(250, 70 + r() * 40, hills[2]),
        ridge(310, 60 + r() * 30, hills[1]),
    ]
    if water:
        parts.append(f'<rect y="360" width="800" height="140" fill="#bfe0e6" opacity="0.55"/>')
        parts.append(f'<rect y="360" width="800" height="10" fill="#ffffff" opacity="0.4"/>')
    parts.append(ridge(380, 55 + r() * 25, hills[0]))
    parts.append("</svg>")
    return "\n".join(parts)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    count = 0
    for f in sorted(glob.glob(os.path.join(DATA_DIR, "rt_*.json"))):
        route = json.load(open(f, encoding="utf-8"))
        rid = route.get("route_id")
        if not rid:
            continue
        base = route.get("base_facts", {})
        surfs = " ".join(base.get("surface_tags", []))
        seasons = base.get("season_tags", [])
        season = seasons[0] if seasons else "夏季"
        if season not in PALETTES:
            season = "夏季"
        svg = build_svg(rid, season, surfs)
        out = os.path.join(OUT_DIR, f"{rid}.svg")
        open(out, "w", encoding="utf-8").write(svg)
        # 写回 cover_image
        route["cover_image"] = f"/covers/{rid}.svg"
        json.dump(route, open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        count += 1
    print(f"generated {count} cover svgs -> public/covers")


if __name__ == "__main__":
    main()
