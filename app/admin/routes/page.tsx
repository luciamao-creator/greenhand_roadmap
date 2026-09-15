"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type RouteListItem = {
  route_id: string;
  route_name: string;
  province_name: string;
  city_name: string;
  route_status: string;
  agent_prefill_status: string;
  map_sync_status: string;
  completion_ratio: number;
  pending_user_report_count: number;
  risk_summary?: {
    risk_coefficient: number;
    risk_level: "low" | "medium" | "high";
    risk_color_token: "emerald" | "amber" | "rose";
    risk_reason_tags: string[];
  };
};

type CreateDraftForm = {
  route_name: string;
  province_name: string;
  city_name: string;
  area_name: string;
  start_point_name: string;
  end_point_name: string;
  route_type: "loop" | "out_and_back" | "one_way";
  map_search_keyword: string;
  trigger_agent_prefill: boolean;
};

const initialCreateForm: CreateDraftForm = {
  route_name: "",
  province_name: "广东",
  city_name: "",
  area_name: "",
  start_point_name: "",
  end_point_name: "",
  route_type: "out_and_back",
  map_search_keyword: "",
  trigger_agent_prefill: true,
};

const statusTheme: Record<string, string> = {
  draft: "bg-amber-50 text-amber-700 border border-amber-200",
  pending_review: "bg-blue-50 text-blue-700 border border-blue-200",
  approved: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  published: "bg-green-50 text-green-700 border border-green-200",
  paused: "bg-gray-100 text-gray-700 border border-gray-200",
  retired: "bg-rose-50 text-rose-700 border border-rose-200",
  candidate: "bg-slate-100 text-slate-700 border border-slate-200",
};

const riskTheme: Record<"low" | "medium" | "high", string> = {
  low: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border border-amber-200",
  high: "bg-rose-50 text-rose-700 border border-rose-200",
};

function getRiskLabel(level?: "low" | "medium" | "high") {
  if (level === "high") return "高风险";
  if (level === "medium") return "中风险";
  return "低风险";
}

async function requestAdmin<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || "请求失败");
  }
  return payload.data as T;
}

export default function RoutesListPage() {
  const router = useRouter();
  const [routes, setRoutes] = useState<RouteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateDraftForm>(initialCreateForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadRoutes = async () => {
    setLoading(true);
    setLoadingError(null);
    try {
      const data = await requestAdmin<{ items: RouteListItem[] }>("/api/admin/routes");
      setRoutes(data.items || []);
    } catch (error) {
      setLoadingError(error instanceof Error ? error.message : "加载路线失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRoutes();
  }, []);

  const summary = useMemo(() => {
    return routes.reduce(
      (acc, route) => {
        acc.total += 1;
        if (route.route_status === "pending_review") acc.pendingReview += 1;
        if (route.route_status === "published") acc.published += 1;
        if (route.pending_user_report_count > 0) acc.withReports += 1;
        if (route.risk_summary?.risk_level === "high") acc.highRisk += 1;
        return acc;
      },
      { total: 0, pendingReview: 0, published: 0, withReports: 0, highRisk: 0 },
    );
  }, [routes]);

  const handleCreateDraft = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);

    try {
      const created = await requestAdmin<{ route_id: string }>("/api/admin/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createForm,
          area_name: createForm.area_name || undefined,
          map_search_keyword: createForm.map_search_keyword || undefined,
        }),
      });
      setCreateOpen(false);
      setCreateForm(initialCreateForm);
      await loadRoutes();
      router.push(`/admin/routes/${created.route_id}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "创建失败");
    } finally {
      setCreating(false);
    }
  };

  const updateForm = <K extends keyof CreateDraftForm>(key: K, value: CreateDraftForm[K]) => {
    setCreateForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <header className="flex min-h-16 items-center justify-between border-b border-gray-200 bg-white px-8">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">路线管理</h1>
          <p className="mt-1 text-xs text-gray-500">先把新路线拉进草稿，再进入工作台触发预填、地图同步、送审和发布。</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen((value) => !value)}
          className="rounded-md bg-black px-4 py-2 font-medium text-white transition-colors hover:bg-gray-800"
        >
          {createOpen ? "收起创建表单" : "+ 新建路线草稿"}
        </button>
      </header>

      <div className="space-y-6 p-8">
        <section className="grid gap-4 md:grid-cols-5">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-gray-500">路线总数</div>
            <div className="mt-2 text-2xl font-bold text-gray-900">{summary.total}</div>
          </div>
          <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
            <div className="text-xs text-gray-500">待审核</div>
            <div className="mt-2 text-2xl font-bold text-blue-700">{summary.pendingReview}</div>
          </div>
          <div className="rounded-xl border border-green-100 bg-white p-4 shadow-sm">
            <div className="text-xs text-gray-500">已发布</div>
            <div className="mt-2 text-2xl font-bold text-green-700">{summary.published}</div>
          </div>
          <div className="rounded-xl border border-rose-100 bg-white p-4 shadow-sm">
            <div className="text-xs text-gray-500">存在用户上报</div>
            <div className="mt-2 text-2xl font-bold text-rose-700">{summary.withReports}</div>
          </div>
          <div className="rounded-xl border border-rose-100 bg-white p-4 shadow-sm">
            <div className="text-xs text-gray-500">高风险路线</div>
            <div className="mt-2 text-2xl font-bold text-rose-700">{summary.highRisk}</div>
          </div>
        </section>

        {createOpen ? (
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-gray-900">创建路线草稿</h2>
              <p className="mt-1 text-sm text-gray-500">只录入最小事实包，创建后直接进入工作台继续触发 Agent 和地图链路。</p>
            </div>

            <form className="space-y-4" onSubmit={handleCreateDraft}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">路线名称</span>
                  <input
                    value={createForm.route_name}
                    onChange={(event) => updateForm("route_name", event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none ring-0 transition focus:border-gray-500"
                    placeholder="例如：马峦山瀑布线"
                    required
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">路线类型</span>
                  <select
                    value={createForm.route_type}
                    onChange={(event) => updateForm("route_type", event.target.value as CreateDraftForm["route_type"])}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                  >
                    <option value="out_and_back">往返</option>
                    <option value="loop">环线</option>
                    <option value="one_way">单程</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">省份</span>
                  <select
                    value={createForm.province_name}
                    onChange={(event) => updateForm("province_name", event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                  >
                    <option value="广东">广东</option>
                    <option value="浙江">浙江</option>
                    <option value="福建">福建</option>
                    <option value="四川">四川</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">城市</span>
                  <input
                    value={createForm.city_name}
                    onChange={(event) => updateForm("city_name", event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                    placeholder="例如：深圳"
                    required
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">区域</span>
                  <input
                    value={createForm.area_name}
                    onChange={(event) => updateForm("area_name", event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                    placeholder="例如：坪山"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">地图检索关键词</span>
                  <input
                    value={createForm.map_search_keyword}
                    onChange={(event) => updateForm("map_search_keyword", event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                    placeholder="例如：马峦山郊野公园 碧岭入口"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">起点</span>
                  <input
                    value={createForm.start_point_name}
                    onChange={(event) => updateForm("start_point_name", event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                    required
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">终点</span>
                  <input
                    value={createForm.end_point_name}
                    onChange={(event) => updateForm("end_point_name", event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition focus:border-gray-500"
                    required
                  />
                </label>
              </div>

              <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={createForm.trigger_agent_prefill}
                  onChange={(event) => updateForm("trigger_agent_prefill", event.target.checked)}
                />
                创建后立即触发 Agent 预填
              </label>

              {createError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{createError}</div>
              ) : null}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCreateOpen(false);
                    setCreateError(null);
                  }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  {creating ? "创建中..." : "创建并进入工作台"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">路线工作流列表</h2>
              <p className="mt-1 text-sm text-gray-500">从这里进入单条路线工作台，继续跑预填、地图同步、送审和发布。</p>
            </div>
            <button
              type="button"
              onClick={() => void loadRoutes()}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
            >
              刷新列表
            </button>
          </div>

          {loadingError ? (
            <div className="border-b border-rose-100 bg-rose-50 px-6 py-3 text-sm text-rose-700">{loadingError}</div>
          ) : null}

          <table className="min-w-full divide-y divide-gray-200 text-left">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">路线名称</th>
                <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">省份 / 城市</th>
                <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">主状态</th>
                <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">风险系数</th>
                <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">预填 / 地图</th>
                <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">完整度</th>
                <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">待审上报</th>
                <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    加载中...
                  </td>
                </tr>
              ) : routes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    暂无路线，请先创建第一条草稿。
                  </td>
                </tr>
              ) : (
                routes.map((route) => (
                  <tr key={route.route_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 align-top">
                      <div className="font-medium text-gray-900">{route.route_name}</div>
                      <div className="mt-1 text-xs text-gray-500">{route.route_id}</div>
                    </td>
                    <td className="px-6 py-4 align-top text-gray-600">
                      {route.province_name} / {route.city_name}
                    </td>
                    <td className="px-6 py-4 align-top">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusTheme[route.route_status] ?? statusTheme.draft}`}>
                        {route.route_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <div className="flex flex-col gap-2">
                        <span
                          className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${
                            riskTheme[route.risk_summary?.risk_level ?? "low"]
                          }`}
                        >
                          {route.risk_summary?.risk_coefficient ?? 0} / {getRiskLabel(route.risk_summary?.risk_level)}
                        </span>
                        {route.risk_summary?.risk_reason_tags?.length ? (
                          <div className="max-w-[180px] text-xs text-gray-500">
                            {route.risk_summary.risk_reason_tags.slice(0, 2).join(" / ")}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top text-sm text-gray-600">
                      <div>预填：{route.agent_prefill_status}</div>
                      <div className="mt-1">地图：{route.map_sync_status}</div>
                    </td>
                    <td className="px-6 py-4 align-top text-gray-600">
                      {Math.round((route.completion_ratio ?? 0) * 100)}%
                    </td>
                    <td className="px-6 py-4 align-top text-gray-600">
                      {route.pending_user_report_count > 0 ? (
                        <span className="font-semibold text-rose-600">{route.pending_user_report_count}</span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td className="px-6 py-4 align-top text-sm font-medium">
                      <Link href={`/admin/routes/${route.route_id}`} className="text-blue-600 hover:text-blue-900">
                        进入工作台
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
