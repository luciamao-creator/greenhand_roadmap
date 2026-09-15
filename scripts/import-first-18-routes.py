#!/usr/bin/env python3
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
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


def load_existing_routes(base_url: str):
    url = f"{base_url}/api/admin/routes?page=1&page_size=100"
    payload = request_json(url)
    items = payload.get("data", {}).get("items", [])
    return {
        (item.get("province_name"), item.get("city_name"), item.get("route_name"))
        for item in items
    }, payload.get("data", {}).get("total", len(items))


def create_route(base_url: str, item):
    return request_json(f"{base_url}/api/admin/routes", method="POST", body=item)


def main():
    base_url = DEFAULT_BASE_URL.rstrip("/")
    dry_run = "--dry-run" in sys.argv

    try:
        existing_keys, before_total = load_existing_routes(base_url)
    except urllib.error.URLError as exc:
        print(f"[import-first-18] 无法访问 {base_url}：{exc}", file=sys.stderr)
        return 1

    items = load_seed_items()
    imported = []
    skipped = []
    failed = []

    for item in items:
        key = (item["province_name"], item["city_name"], item["route_name"])
        if key in existing_keys:
            skipped.append(item)
            continue

        if dry_run:
            imported.append(
                {
                    "route_name": item["route_name"],
                    "route_id": None,
                    "agent_prefill_status": "dry_run",
                    "map_sync_status": "dry_run",
                }
            )
            continue

        try:
            payload = create_route(base_url, item)
            data = payload.get("data", {})
            imported.append(
                {
                    "route_name": item["route_name"],
                    "route_id": data.get("route_id"),
                    "agent_prefill_status": data.get("agent_prefill_status"),
                    "map_sync_status": data.get("map_sync_status"),
                }
            )
            existing_keys.add(key)
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            failed.append({"route_name": item["route_name"], "status": exc.code, "body": body})
        except urllib.error.URLError as exc:
            failed.append({"route_name": item["route_name"], "status": "network_error", "body": str(exc)})

    after_total = before_total + len(imported) if dry_run else load_existing_routes(base_url)[1]
    summary = {
        "base_url": base_url,
        "dry_run": dry_run,
        "before_total": before_total,
        "after_total": after_total,
        "planned_count": len(items),
        "imported_count": len(imported),
        "skipped_count": len(skipped),
        "failed_count": len(failed),
        "imported": imported,
        "skipped": [item["route_name"] for item in skipped],
        "failed": failed,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if not failed else 2


if __name__ == "__main__":
    raise SystemExit(main())
