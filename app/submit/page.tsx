"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type WaypointForm = { point_name: string };

type CandidateForm = {
  route_name: string;
  province_name: string;
  city_name: string;
  area_name: string;
  route_type: "loop" | "out_and_back" | "one_way";
  start_point: string;
  end_point: string;
  waypoints: WaypointForm[];
  user_description: string;
  submitter_name: string;
  submitter_contact: string;
};

type CreateCandidateResult = {
  route_id: string;
};

const FALLBACK_PROVINCES = ["广东", "浙江", "福建", "四川", "上海", "江苏", "湖北", "北京", "陕西", "重庆", "辽宁", "安徽", "湖南", "河北", "山东"];

const ROUTE_TYPES: [CandidateForm["route_type"], string, string][] = [
  ["out_and_back", "往返", "原路返回，走多远算多远"],
  ["loop", "环线", "绕一圈回到起点"],
  ["one_way", "穿越", "从 A 走到 B，不回头"],
];

const initialForm: CandidateForm = {
  route_name: "",
  province_name: "",
  city_name: "",
  area_name: "",
  route_type: "out_and_back",
  start_point: "",
  end_point: "",
  waypoints: [{ point_name: "" }],
  user_description: "",
  submitter_name: "",
  submitter_contact: "",
};

export default function SubmitPage() {
  const [form, setForm] = useState<CandidateForm>(initialForm);
  const [provinces, setProvinces] = useState<string[]>(FALLBACK_PROVINCES);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreateCandidateResult | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/regions")
      .then((r) => r.json())
      .then((p) => {
        if (!alive) return;
        const list = (p.data?.provinces ?? []).map((x: { province: string }) => x.province).filter(Boolean);
        if (list.length) setProvinces(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const set = <K extends keyof CandidateForm>(key: K, value: CandidateForm[K]) =>
    setForm((cur) => ({ ...cur, [key]: value }));

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const waypoints = form.waypoints.map((w) => ({ point_name: w.point_name.trim() })).filter((w) => w.point_name);
      const response = await fetch("/api/route-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route_name: form.route_name.trim(),
          province_name: form.province_name,
          city_name: form.city_name.trim(),
          area_name: form.area_name.trim() || undefined,
          route_type: form.route_type,
          start_point: { point_name: form.start_point.trim(), point: undefined },
          end_point: { point_name: form.end_point.trim(), point: undefined },
          waypoints,
          user_description: form.user_description.trim(),
          submitter_name: form.submitter_name.trim() || undefined,
          submitter_contact: form.submitter_contact.trim() || undefined,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "提交失败，请稍后再试");
      }
      setSuccess(payload.data as CreateCandidateResult);
      setForm(initialForm);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "提交失败，请稍后再试");
    } finally {
      setCreating(false);
    }
  };

  const inputClass =
    "w-full rounded-2xl border bg-white px-4 py-3 text-base text-ink outline-none transition focus:border-[var(--primary)]";
  const inputStyle = { borderColor: "rgba(18,32,24,0.12)" } as const;
  const labelClass = "mb-1.5 block text-sm font-medium text-ink";

  if (success) {
    return (
      <main className="min-h-screen px-5 pt-[max(1.5rem,env(safe-area-inset-top))]" style={{ background: "linear-gradient(180deg,#eef6f1 0%,#f6faf7 100%)" }}>
        <div className="mx-auto w-full max-w-[460px]">
          <div className="frost-strong rounded-[24px] p-6 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full text-2xl" style={{ background: "var(--primary-soft)" }}>
              🎉
            </div>
            <h1 className="mt-4 text-xl font-bold text-ink">已收到，感谢分享！</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              这条路线会先进入审核，确认信息可靠后会出现在推荐里。你不用做任何额外操作。
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <Link href="/" className="btn-primary w-full rounded-2xl py-3 text-center text-sm font-semibold">
                回首页继续逛
              </Link>
              <button
                type="button"
                onClick={() => setSuccess(null)}
                className="w-full rounded-2xl border bg-white/80 py-3 text-sm font-medium text-ink"
                style={{ borderColor: "rgba(18,32,24,0.12)" }}
              >
                再推荐一条
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-16 pt-[max(1.25rem,env(safe-area-inset-top))]" style={{ background: "linear-gradient(180deg,#eef6f1 0%,#f6faf7 100%)" }}>
      <div className="mx-auto w-full max-w-[460px] px-5">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1 text-sm font-medium text-muted">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            返回
          </Link>
        </div>

        <header className="mt-5">
          <h1 className="serif text-2xl font-bold tracking-tight text-ink">推荐一条好走的路线</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            你走过、觉得适合新手的路线都可以分享。填几个关键信息就行，剩下的我们来完善。
          </p>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="frost-strong mt-5 space-y-5 rounded-[24px] p-5">
            <div>
              <label className={labelClass} htmlFor="route_name">路线名称</label>
              <input
                id="route_name"
                value={form.route_name}
                onChange={(e) => set("route_name", e.target.value)}
                className={inputClass}
                style={inputStyle}
                placeholder="例如：马峦山瀑布线"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="province_name">所在省份</label>
                <select
                  id="province_name"
                  value={form.province_name}
                  onChange={(e) => set("province_name", e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                  required
                >
                  <option value="" disabled>请选择</option>
                  {provinces.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="city_name">城市</label>
                <input
                  id="city_name"
                  value={form.city_name}
                  onChange={(e) => set("city_name", e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                  placeholder="例如：深圳"
                  required
                />
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="area_name">区县（选填）</label>
              <input
                id="area_name"
                value={form.area_name}
                onChange={(e) => set("area_name", e.target.value)}
                className={inputClass}
                style={inputStyle}
                placeholder="例如：坪山"
              />
            </div>

            <div>
              <span className={labelClass}>路线类型</span>
              <div className="grid grid-cols-3 gap-2">
                {ROUTE_TYPES.map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set("route_type", value)}
                    className="rounded-2xl px-2 py-2.5 text-center text-sm font-medium transition"
                    style={
                      form.route_type === value
                        ? { background: "var(--primary-soft)", color: "var(--primary)", border: "1px solid rgba(29,124,87,0.35)" }
                        : { background: "rgba(18,32,24,0.04)", color: "var(--ink)", border: "1px solid transparent" }
                    }
                    title={hint}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="frost-strong mt-4 space-y-5 rounded-[24px] p-5">
            <div>
              <label className={labelClass} htmlFor="start_point">从哪里出发</label>
              <input
                id="start_point"
                value={form.start_point}
                onChange={(e) => set("start_point", e.target.value)}
                className={inputClass}
                style={inputStyle}
                placeholder="例如：马峦山公园北门"
                required
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className={labelClass + " mb-0"}>中途会经过（选填）</span>
                <button
                  type="button"
                  onClick={() => setForm((cur) => ({ ...cur, waypoints: [...cur.waypoints, { point_name: "" }] }))}
                  className="text-sm font-semibold text-primary"
                >
                  ＋ 加一个
                </button>
              </div>
              <div className="space-y-2">
                {form.waypoints.map((w, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={w.point_name}
                      onChange={(e) =>
                        setForm((cur) => ({
                          ...cur,
                          waypoints: cur.waypoints.map((item, idx) => (idx === i ? { ...item, point_name: e.target.value } : item)),
                        }))
                      }
                      className={inputClass}
                      style={inputStyle}
                      placeholder="例如：瀑布观景台"
                    />
                    {form.waypoints.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setForm((cur) => ({ ...cur, waypoints: cur.waypoints.filter((_, idx) => idx !== i) }))}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted"
                        style={{ background: "rgba(18,32,24,0.05)" }}
                        aria-label="删除该节点"
                      >
                        ✕
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="end_point">走到哪里结束</label>
              <input
                id="end_point"
                value={form.end_point}
                onChange={(e) => set("end_point", e.target.value)}
                className={inputClass}
                style={inputStyle}
                placeholder="例如：梅沙湾滨海栈道"
                required
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="user_description">这条路好在哪 / 要注意什么</label>
              <textarea
                id="user_description"
                value={form.user_description}
                onChange={(e) => set("user_description", e.target.value)}
                className={inputClass}
                style={{ ...inputStyle, minHeight: 110 }}
                placeholder="例如：树荫多、台阶好走，适合夏天；中途有小卖部，岔路记得往左。"
                required
              />
            </div>
          </div>

          <div className="frost-strong mt-4 space-y-5 rounded-[24px] p-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="submitter_name">怎么称呼（选填）</label>
                <input
                  id="submitter_name"
                  value={form.submitter_name}
                  onChange={(e) => set("submitter_name", e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                  placeholder="例如：阿山"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="submitter_contact">联系方式（选填）</label>
                <input
                  id="submitter_contact"
                  value={form.submitter_contact}
                  onChange={(e) => set("submitter_contact", e.target.value)}
                  className={inputClass}
                  style={inputStyle}
                  placeholder="微信 / 邮箱"
                />
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : null}

          <button
            type="submit"
            disabled={creating}
            className="btn-primary mt-5 w-full rounded-2xl py-3.5 text-base font-semibold disabled:opacity-60"
          >
            {creating ? "提交中…" : "提交这条路线"}
          </button>
          <p className="mt-3 text-center text-xs text-muted">提交后会先经人工确认，确认后才会对外展示</p>
        </form>
      </div>
    </main>
  );
}
