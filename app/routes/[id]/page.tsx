"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type GeoPoint = {
  type: "Point";
  coordinates: [number, number];
};

type RouteItem = {
  route_id: string;
  route_name: string;
  province_name: string;
  city_name: string;
  area_name?: string;
  start_point_name: string;
  end_point_name: string;
  route_type: string;
  route_status: string;
  pending_user_report_count: number;
  duration_minutes?: number | string;
  distance_km?: number | string;
  elevation_gain_m?: number | string;
  summary_short?: string;
  route_logic_summary?: string;
  route_nodes: Array<Record<string, unknown>>;
  route_exit_points: Array<Record<string, unknown>>;
  route_risk_points: Array<Record<string, unknown>>;
};

type ContributionForm = {
  report_type: "node" | "exit_point" | "risk_point";
  suggestion_action: "add" | "modify" | "delete";
  proposal_title: string;
  proposal_text: string;
  lng: string;
  lat: string;
  reporter_name: string;
};

const initialContributionForm: ContributionForm = {
  report_type: "node",
  suggestion_action: "add",
  proposal_title: "",
  proposal_text: "",
  lng: "",
  lat: "",
  reporter_name: "",
};

function getItemLabel(item: Record<string, unknown>) {
  return (
    (item.node_name as string | undefined) ??
    (item.exit_name as string | undefined) ??
    (item.risk_title as string | undefined) ??
    (item.title as string | undefined) ??
    "未命名点"
  );
}

function getPointPreview(item: Record<string, unknown>) {
  const point = item.point as GeoPoint | undefined;
  if (!point || !Array.isArray(point.coordinates)) {
    return "无坐标";
  }
  return `${point.coordinates[0]}, ${point.coordinates[1]}`;
}

function buildOptionalPoint(lng: string, lat: string) {
  const hasLng = lng.trim() !== "";
  const hasLat = lat.trim() !== "";
  if (!hasLng && !hasLat) {
    return undefined;
  }
  if (!hasLng || !hasLat) {
    throw new Error("请同时填写经度和纬度，或都留空");
  }
  return {
    lng: Number(lng),
    lat: Number(lat),
  };
}

function toFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function formatDistance(value: unknown) {
  const distance = toFiniteNumber(value);
  return typeof distance === "number" ? `${distance.toFixed(distance >= 10 ? 0 : 1)} km` : "待补齐";
}

function formatDuration(value: unknown) {
  const minutes = toFiniteNumber(value);
  if (typeof minutes !== "number") {
    return "待补齐";
  }
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (hours <= 0) {
    return `${remainMinutes} 分钟`;
  }
  if (remainMinutes === 0) {
    return `${hours} 小时`;
  }
  return `${hours} 小时 ${remainMinutes} 分钟`;
}

function formatElevationGain(value: unknown) {
  const elevationGain = toFiniteNumber(value);
  return typeof elevationGain === "number" ? `${Math.round(elevationGain)} m` : "待补齐";
}

function formatPace(durationValue: unknown, distanceValue: unknown) {
  const minutes = toFiniteNumber(durationValue);
  const distanceKm = toFiniteNumber(distanceValue);
  if (typeof minutes !== "number" || typeof distanceKm !== "number" || distanceKm <= 0) {
    return "待补齐";
  }
  const pace = minutes / distanceKm;
  const paceMinutes = Math.floor(pace);
  const paceSeconds = Math.round((pace - paceMinutes) * 60);
  return `${paceMinutes}'${String(paceSeconds).padStart(2, "0")}" / km`;
}

function getRouteEndpointText(route: RouteItem) {
  if (route.route_type === "out_and_back") {
    return `起终点：${route.start_point_name} | 折返点：${route.end_point_name}`;
  }
  if (route.route_type === "loop" && route.start_point_name === route.end_point_name) {
    return `起终点：${route.start_point_name}（环线同点）`;
  }
  return `起点：${route.start_point_name} | 终点：${route.end_point_name}`;
}

function getRouteTypeLabel(routeType?: string) {
  if (routeType === "loop") return "环线";
  if (routeType === "out_and_back") return "往返";
  return "单程";
}

function getRouteTypeBadgeTone(routeType?: string) {
  if (routeType === "loop") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (routeType === "out_and_back") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export default function PublicRoutePage() {
  const params = useParams();
  const routeId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [route, setRoute] = useState<RouteItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<ContributionForm>(initialContributionForm);

  const sections = useMemo(
    () => [
      { title: "关键节点", items: route?.route_nodes ?? [] },
      { title: "风险点", items: route?.route_risk_points ?? [] },
      { title: "下撤点", items: route?.route_exit_points ?? [] },
    ],
    [route],
  );

  const loadRoute = async () => {
    if (!routeId) {
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/routes/${routeId}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "加载路线失败");
      }
      setRoute(payload.data as RouteItem);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载路线失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRoute();
  }, [routeId]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!routeId) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const response = await fetch(`/api/routes/${routeId}/contributions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_type: form.report_type,
          suggestion_action: form.suggestion_action,
          proposal_title: form.proposal_title,
          proposal_text: form.proposal_text,
          proposal_point: buildOptionalPoint(form.lng, form.lat),
          reporter_name: form.reporter_name || undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "提交建议失败");
      }

      setSubmitSuccess("建议已进入待审池。");
      setForm(initialContributionForm);
      await loadRoute();
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "提交建议失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <main className="p-8 text-gray-500">加载路线中...</main>;
  }

  if (error || !route) {
    return (
      <main className="p-8">
        <div className="rounded-lg border border-red-300 bg-white p-5 text-red-700">{error || "未找到路线"}</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-8 py-10">
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <section className="mb-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between" style={{ gap: 24 }}>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{route.route_name}</h1>
              <p className="mt-2 text-sm text-gray-600">
                {route.province_name} / {route.city_name} / {route.area_name || "暂无"}
              </p>
              <p className="mt-1 text-sm text-gray-600">{getRouteEndpointText(route)}</p>
            </div>
            <div className="text-sm text-gray-600">
              <div>状态：{route.route_status}</div>
              <div className="mt-1">待审建议：{route.pending_user_report_count}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
              <div className="text-xs font-semibold text-orange-700">全程距离</div>
              <div className="mt-2 text-xl font-bold text-gray-900">{formatDistance(route.distance_km)}</div>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs font-semibold text-blue-700">预计时间</div>
              <div className="mt-2 text-xl font-bold text-gray-900">{formatDuration(route.duration_minutes)}</div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs font-semibold text-emerald-700">累计爬升</div>
              <div className="mt-2 text-xl font-bold text-gray-900">{formatElevationGain(route.elevation_gain_m)}</div>
            </div>
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-4">
              <div className="text-xs font-semibold text-violet-700">平均配速</div>
              <div className="mt-2 text-xl font-bold text-gray-900">{formatPace(route.duration_minutes, route.distance_km)}</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium text-gray-600">路线类型</span>
            <span className={`inline-flex rounded-full border px-3 py-1 font-semibold ${getRouteTypeBadgeTone(route.route_type)}`}>
              {getRouteTypeLabel(route.route_type)}
            </span>
          </div>

          {route.summary_short ? (
            <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-700">{route.summary_short}</div>
          ) : null}
          {route.route_logic_summary ? (
            <div className="mt-3 rounded-lg bg-gray-50 p-4 text-sm text-gray-700">{route.route_logic_summary}</div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/" className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700">
              返回投稿页
            </Link>
            <Link href={`/admin/routes/${route.route_id}`} className="rounded-md bg-black px-3 py-2 text-sm text-white">
              去后台复核
            </Link>
          </div>
        </section>

        <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0, 1.2fr) minmax(360px, 0.8fr)" }}>
          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">当前结构化内容</h2>
              <p className="mt-1 text-sm text-gray-500">Alpha 阶段先让共创者看到当前骨架，再提交建议。</p>
            </div>

            <div className="space-y-4">
              {sections.map((section) => (
                <div key={section.title}>
                  <div className="mb-2 text-sm font-semibold text-gray-800">
                    {section.title} ({section.items.length})
                  </div>
                  {section.items.length === 0 ? (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">暂无</div>
                  ) : (
                    <div className="space-y-2">
                      {section.items.map((item, index) => (
                        <div key={`${section.title}-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                          <div className="font-medium text-gray-900">{getItemLabel(item)}</div>
                          <div className="mt-1 text-sm text-gray-600">{getPointPreview(item)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">提交共创建议</h2>
              <p className="mt-1 text-sm text-gray-500">支持新增、修改、删除三种动作；坐标可选，但带坐标更方便后台直接合并。</p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">建议类型</span>
                  <select
                    value={form.report_type}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        report_type: event.target.value as ContributionForm["report_type"],
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-4 py-2"
                  >
                    <option value="node">关键节点</option>
                    <option value="risk_point">风险点</option>
                    <option value="exit_point">下撤点</option>
                  </select>
                </label>

                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">动作</span>
                  <select
                    value={form.suggestion_action}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        suggestion_action: event.target.value as ContributionForm["suggestion_action"],
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-4 py-2"
                  >
                    <option value="add">新增</option>
                    <option value="modify">修改</option>
                    <option value="delete">删除</option>
                  </select>
                </label>
              </div>

              <label className="space-y-1 text-sm block">
                <span className="font-medium text-gray-700">标题</span>
                <input
                  value={form.proposal_title}
                  onChange={(event) => setForm((current) => ({ ...current, proposal_title: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2"
                  placeholder="例如：新增瀑布观景台节点"
                  required
                />
              </label>

              <label className="space-y-1 text-sm block">
                <span className="font-medium text-gray-700">建议说明</span>
                <textarea
                  value={form.proposal_text}
                  onChange={(event) => setForm((current) => ({ ...current, proposal_text: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2"
                  style={{ minHeight: 120 }}
                  placeholder="写清楚你建议的事实依据、节点价值或需要修改的原因。"
                  required
                />
              </label>

              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">经度</span>
                  <input
                    value={form.lng}
                    onChange={(event) => setForm((current) => ({ ...current, lng: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2"
                    placeholder="选填"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">纬度</span>
                  <input
                    value={form.lat}
                    onChange={(event) => setForm((current) => ({ ...current, lat: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2"
                    placeholder="选填"
                  />
                </label>
              </div>

              <label className="space-y-1 text-sm block">
                <span className="font-medium text-gray-700">提交人</span>
                <input
                  value={form.reporter_name}
                  onChange={(event) => setForm((current) => ({ ...current, reporter_name: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2"
                  placeholder="例如：社区共创用户"
                />
              </label>

              {submitError ? (
                <div className="rounded-lg border border-red-300 bg-white p-4 text-sm text-red-700">{submitError}</div>
              ) : null}
              {submitSuccess ? (
                <div className="rounded-lg border border-gray-200 bg-green-50 p-4 text-sm text-green-800">{submitSuccess}</div>
              ) : null}

              <button type="submit" disabled={submitting} className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white">
                {submitting ? "提交中..." : "提交建议"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
