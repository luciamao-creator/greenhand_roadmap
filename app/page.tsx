"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type NamedPointForm = {
  point_name: string;
  lng: string;
  lat: string;
};

type CandidateForm = {
  route_name: string;
  province_name: string;
  city_name: string;
  area_name: string;
  route_type: "loop" | "out_and_back" | "one_way";
  start_point: NamedPointForm;
  end_point: NamedPointForm;
  waypoints: NamedPointForm[];
  user_description: string;
  submitter_name: string;
  submitter_contact: string;
};

type CreateCandidateResult = {
  route_id: string;
  created_report_count?: number;
};

const initialPointForm: NamedPointForm = {
  point_name: "",
  lng: "",
  lat: "",
};

const initialForm: CandidateForm = {
  route_name: "",
  province_name: "广东",
  city_name: "",
  area_name: "",
  route_type: "out_and_back",
  start_point: { ...initialPointForm },
  end_point: { ...initialPointForm },
  waypoints: [{ ...initialPointForm }],
  user_description: "",
  submitter_name: "",
  submitter_contact: "",
};

function toOptionalPoint(point: NamedPointForm) {
  const hasLng = point.lng.trim() !== "";
  const hasLat = point.lat.trim() !== "";
  if (!hasLng && !hasLat) {
    return undefined;
  }
  if (!hasLng || !hasLat) {
    throw new Error(`请为“${point.point_name || "未命名点"}”同时填写经度和纬度，或都留空`);
  }
  return {
    lng: Number(point.lng),
    lat: Number(point.lat),
  };
}

export default function HomePage() {
  const router = useRouter();
  const [candidateForm, setCandidateForm] = useState<CandidateForm>(initialForm);
  const [routeLookup, setRouteLookup] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreateCandidateResult | null>(null);

  const waypointSummary = useMemo(() => {
    return candidateForm.waypoints
      .map((item) => item.point_name.trim())
      .filter(Boolean)
      .join(" -> ");
  }, [candidateForm.waypoints]);

  const updateWaypoint = (index: number, key: keyof NamedPointForm, value: string) => {
    setCandidateForm((current) => ({
      ...current,
      waypoints: current.waypoints.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/route-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route_name: candidateForm.route_name,
          province_name: candidateForm.province_name,
          city_name: candidateForm.city_name,
          area_name: candidateForm.area_name || undefined,
          route_type: candidateForm.route_type,
          start_point: {
            point_name: candidateForm.start_point.point_name,
            point: toOptionalPoint(candidateForm.start_point),
          },
          end_point: {
            point_name: candidateForm.end_point.point_name,
            point: toOptionalPoint(candidateForm.end_point),
          },
          waypoints: candidateForm.waypoints.map((item) => ({
            point_name: item.point_name,
            point: toOptionalPoint(item),
          })),
          user_description: candidateForm.user_description,
          submitter_name: candidateForm.submitter_name || undefined,
          submitter_contact: candidateForm.submitter_contact || undefined,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "投稿失败");
      }

      setSuccess(payload.data as CreateCandidateResult);
      setCandidateForm(initialForm);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "投稿失败");
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 px-8 py-12">
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <section className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between" style={{ gap: 24 }}>
            <div>
              <h1 className="text-xl font-bold text-gray-900">V1.2 投稿入口</h1>
              <p className="mt-2 text-sm text-gray-600">
                起点、终点、途经节点名称必填；坐标选填，只用于帮助后台更准确定位。
              </p>
            </div>
            <div className="text-sm text-gray-600">
              <div>后台入口：/admin/routes</div>
              <div className="mt-1">共创入口：/routes/&lt;route_id&gt;</div>
            </div>
          </div>
        </section>

        <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(320px, 1fr)" }}>
          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">候选路线投稿</h2>
              <p className="mt-1 text-sm text-gray-500">
                先把真实路线骨架投进系统，后台收到后会以 `candidate + 待审建议` 的方式承接。
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">路线名称</span>
                  <input
                    value={candidateForm.route_name}
                    onChange={(event) => setCandidateForm((current) => ({ ...current, route_name: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2"
                    placeholder="例如：马峦山瀑布线"
                    required
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">路线类型</span>
                  <select
                    value={candidateForm.route_type}
                    onChange={(event) =>
                      setCandidateForm((current) => ({
                        ...current,
                        route_type: event.target.value as CandidateForm["route_type"],
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-4 py-2"
                  >
                    <option value="out_and_back">往返</option>
                    <option value="loop">环线</option>
                    <option value="one_way">单程</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">省份</span>
                  <select
                    value={candidateForm.province_name}
                    onChange={(event) => setCandidateForm((current) => ({ ...current, province_name: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2"
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
                    value={candidateForm.city_name}
                    onChange={(event) => setCandidateForm((current) => ({ ...current, city_name: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2"
                    placeholder="例如：深圳"
                    required
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">区域</span>
                  <input
                    value={candidateForm.area_name}
                    onChange={(event) => setCandidateForm((current) => ({ ...current, area_name: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2"
                    placeholder="例如：坪山"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-gray-700">投稿人</span>
                  <input
                    value={candidateForm.submitter_name}
                    onChange={(event) => setCandidateForm((current) => ({ ...current, submitter_name: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2"
                    placeholder="例如：站长"
                  />
                </label>
              </div>

              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-3 font-medium text-gray-800">起点</div>
                  <div className="space-y-2">
                    <input
                      value={candidateForm.start_point.point_name}
                      onChange={(event) =>
                        setCandidateForm((current) => ({
                          ...current,
                          start_point: { ...current.start_point, point_name: event.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-4 py-2"
                      placeholder="起点名称"
                      required
                    />
                    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                      <input
                        value={candidateForm.start_point.lng}
                        onChange={(event) =>
                          setCandidateForm((current) => ({
                            ...current,
                            start_point: { ...current.start_point, lng: event.target.value },
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-2"
                        placeholder="经度（选填）"
                      />
                      <input
                        value={candidateForm.start_point.lat}
                        onChange={(event) =>
                          setCandidateForm((current) => ({
                            ...current,
                            start_point: { ...current.start_point, lat: event.target.value },
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-2"
                        placeholder="纬度（选填）"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-3 font-medium text-gray-800">终点</div>
                  <div className="space-y-2">
                    <input
                      value={candidateForm.end_point.point_name}
                      onChange={(event) =>
                        setCandidateForm((current) => ({
                          ...current,
                          end_point: { ...current.end_point, point_name: event.target.value },
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-4 py-2"
                      placeholder="终点名称"
                      required
                    />
                    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                      <input
                        value={candidateForm.end_point.lng}
                        onChange={(event) =>
                          setCandidateForm((current) => ({
                            ...current,
                            end_point: { ...current.end_point, lng: event.target.value },
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-2"
                        placeholder="经度（选填）"
                      />
                      <input
                        value={candidateForm.end_point.lat}
                        onChange={(event) =>
                          setCandidateForm((current) => ({
                            ...current,
                            end_point: { ...current.end_point, lat: event.target.value },
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-2"
                        placeholder="纬度（选填）"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-800">途经节点</div>
                    <div className="mt-1 text-xs text-gray-500">每个节点名称必填，坐标可选。</div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setCandidateForm((current) => ({
                        ...current,
                        waypoints: [...current.waypoints, { ...initialPointForm }],
                      }))
                    }
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
                  >
                    + 新增节点
                  </button>
                </div>

                <div className="space-y-3">
                  {candidateForm.waypoints.map((waypoint, index) => (
                    <div key={`waypoint-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-800">节点 {index + 1}</span>
                        {candidateForm.waypoints.length > 1 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setCandidateForm((current) => ({
                                ...current,
                                waypoints: current.waypoints.filter((_, itemIndex) => itemIndex !== index),
                              }))
                            }
                            className="rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-600"
                          >
                            删除
                          </button>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <input
                          value={waypoint.point_name}
                          onChange={(event) => updateWaypoint(index, "point_name", event.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-4 py-2"
                          placeholder="例如：瀑布观景台"
                          required
                        />
                        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                          <input
                            value={waypoint.lng}
                            onChange={(event) => updateWaypoint(index, "lng", event.target.value)}
                            className="w-full rounded-lg border border-gray-300 px-4 py-2"
                            placeholder="经度（选填）"
                          />
                          <input
                            value={waypoint.lat}
                            onChange={(event) => updateWaypoint(index, "lat", event.target.value)}
                            className="w-full rounded-lg border border-gray-300 px-4 py-2"
                            placeholder="纬度（选填）"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <label className="space-y-1 text-sm block">
                <span className="font-medium text-gray-700">路线描述</span>
                <textarea
                  value={candidateForm.user_description}
                  onChange={(event) => setCandidateForm((current) => ({ ...current, user_description: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2"
                  style={{ minHeight: 110 }}
                  placeholder="补充这条线的玩法、顺序、运营价值或你确信的事实依据。"
                  required
                />
              </label>

              <label className="space-y-1 text-sm block">
                <span className="font-medium text-gray-700">联系方式</span>
                <input
                  value={candidateForm.submitter_contact}
                  onChange={(event) => setCandidateForm((current) => ({ ...current, submitter_contact: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2"
                  placeholder="例如：微信 / 邮箱（选填）"
                />
              </label>

              {error ? (
                <div className="rounded-lg border border-red-300 bg-white p-4 text-sm text-red-700">{error}</div>
              ) : null}

              {success ? (
                <div className="rounded-lg border border-gray-200 bg-green-50 p-4 text-sm text-gray-800">
                  <div className="font-semibold text-green-800">投稿已进入待审池</div>
                  <div className="mt-2">路线 ID：{success.route_id}</div>
                  <div className="mt-1">自动生成待审建议：{success.created_report_count ?? 0} 条</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/admin/routes/${success.route_id}`} className="rounded-md bg-black px-3 py-2 text-sm text-white">
                      去后台复核
                    </Link>
                    <Link
                      href={`/routes/${success.route_id}`}
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
                    >
                      去共创页查看
                    </Link>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">当前节点链路：{waypointSummary || "请至少填写一个途经节点"}</div>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
                >
                  {creating ? "提交中..." : "提交候选路线"}
                </button>
              </div>
            </form>
          </section>

          <aside className="space-y-4">
            <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">V1.3 alpha 共创</h2>
              <p className="mt-2 text-sm text-gray-600">
                输入 `route_id` 进入路线共创页，提交新增、修改、删除建议；Agent 和后台会把它们纳入待审。
              </p>
              <div className="mt-4 space-y-3">
                <input
                  value={routeLookup}
                  onChange={(event) => setRouteLookup(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2"
                  placeholder="例如：gd-shenzhen-maluan-xxxx"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (routeLookup.trim()) {
                      router.push(`/routes/${routeLookup.trim()}`);
                    }
                  }}
                  className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
                >
                  打开共创页
                </button>
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">当前口径</h2>
              <div className="mt-3 space-y-2 text-sm text-gray-600">
                <div>V1.2：名称主输入，坐标可选辅助。</div>
                <div>V1.3 alpha：先做建议提交，不做完整地图编辑器。</div>
                <div>后台复核：你在工作台里决定接受、驳回和合并目标。</div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
