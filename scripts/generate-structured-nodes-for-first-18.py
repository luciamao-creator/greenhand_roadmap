#!/usr/bin/env python3
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


DEFAULT_BASE_URL = os.environ.get("TRAE_ROUTE_ADMIN_BASE_URL", "http://127.0.0.1:3000")
DATA_FILE = Path(__file__).resolve().parent / "route-batch-first-18.json"


def request_json(url: str, method: str = "GET", body=None):
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def load_seed_items():
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def load_matching_routes(base_url: str):
    payload = request_json(f"{base_url}/api/admin/routes?page=1&page_size=100")
    items = payload.get("data", {}).get("items", [])
    return {
        (item.get("province_name"), item.get("city_name"), item.get("route_name")): item.get("route_id")
        for item in items
    }


def load_route_detail(base_url: str, route_id: str):
    return request_json(f"{base_url}/api/admin/routes/{urllib.parse.quote(route_id, safe='')}").get("data", {})


def trigger_structured_nodes(base_url: str, route_id: str, force_refresh: bool):
    return request_json(
        f"{base_url}/api/admin/routes/{urllib.parse.quote(route_id, safe='')}/structured-nodes",
        method="POST",
        body={"force_refresh": force_refresh},
    )


def main():
    base_url = DEFAULT_BASE_URL.rstrip("/")
    force_refresh = "--force-refresh" in sys.argv
    routes = load_matching_routes(base_url)
    seeds = load_seed_items()
    generated = []
    skipped = []
    failed = []

    for item in seeds:
        key = (item["province_name"], item["city_name"], item["route_name"])
        route_id = routes.get(key)
        if not route_id:
            failed.append({"route_name": item["route_name"], "reason": "route_not_found"})
            continue

        detail = load_route_detail(base_url, route_id)
        panels = detail.get("panels", {})
        geometry = panels.get("route_geometry") or {}
        current_count = (
            len(panels.get("route_nodes", []))
            + len(panels.get("route_exit_points", []))
            + len(panels.get("route_risk_points", []))
        )

        if not geometry.get("route_polyline"):
            failed.append({"route_name": item["route_name"], "route_id": route_id, "reason": "missing_geometry"})
            continue

        if current_count > 0 and not force_refresh:
            skipped.append({"route_name": item["route_name"], "route_id": route_id, "reason": "already_generated"})
            continue

        try:
            payload = trigger_structured_nodes(base_url, route_id, force_refresh=force_refresh).get("data", {})
            generated.append(
                {
                    "route_name": item["route_name"],
                    "route_id": route_id,
                    "counts": payload.get("counts", {}),
                    "basis": payload.get("basis", {}),
                }
            )
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            failed.append({"route_name": item["route_name"], "route_id": route_id, "reason": "http_error", "status": exc.code, "body": body})
        except urllib.error.URLError as exc:
            failed.append({"route_name": item["route_name"], "route_id": route_id, "reason": "network_error", "body": str(exc)})

    summary = {
        "base_url": base_url,
        "force_refresh": force_refresh,
        "planned_count": len(seeds),
        "generated_count": len(generated),
        "skipped_count": len(skipped),
        "failed_count": len(failed),
        "generated": generated,
        "skipped": skipped,
        "failed": failed,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if not failed else 2


if __name__ == "__main__":
    raise SystemExit(main())
