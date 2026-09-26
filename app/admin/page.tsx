import fs from "fs";
import path from "path";
import { listSubmissions, type SubmissionSummary } from "../../lib/server/services/submission-store";

export const dynamic = "force-dynamic";

type SearchParams = { token?: string };

function readDetail(summary: SubmissionSummary): { user_description?: string; start?: string; end?: string; waypoints?: string[] } | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "submissions", summary.file), "utf-8"));
    const input = raw.input ?? {};
    return {
      user_description: input.user_description,
      start: input.start_point?.point_name,
      end: input.end_point?.point_name,
      waypoints: (input.waypoints ?? []).map((w: { point_name: string }) => w.point_name),
    };
  } catch {
    return null;
  }
}

export default async function AdminSubmissionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const expected = process.env.ADMIN_VIEW_TOKEN;
  const isProd = process.env.NODE_ENV === "production";
  // 生产环境必须配置 ADMIN_VIEW_TOKEN，否则投稿台公网可读（含投稿人联系方式），直接锁死
  const locked = (Boolean(expected) && sp.token !== expected) || (isProd && !expected);

  const items = locked ? [] : listSubmissions();

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif", color: "#18201a" }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>用户投稿审核台</h1>
        <span style={{ fontSize: 13, color: "#6b7a70" }}>共 {items.length} 条 · 落盘于 data/submissions/</span>
      </header>

      {locked ? (
        <p style={{ marginTop: 24, padding: 16, borderRadius: 12, background: "#fff4f4", color: "#b42323" }}>
          需要管理员 token：访问 <code>/admin?token=你的ADMIN_VIEW_TOKEN</code>
        </p>
      ) : items.length === 0 ? (
        <p style={{ marginTop: 24, color: "#6b7a70" }}>还没有收到投稿。用户在前端「推荐一条好走的路线」提交后会出现在这里。</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 20, fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#6b7a70", borderBottom: "1px solid #e3e9e4" }}>
              <th style={th}>类型</th>
              <th style={th}>路线 / 对象</th>
              <th style={th}>地区</th>
              <th style={th}>投稿人</th>
              <th style={th}>联系方式</th>
              <th style={th}>提交时间</th>
              <th style={th}>关键信息</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const detail = readDetail(it);
              const points = [detail?.start, ...(detail?.waypoints ?? []), detail?.end].filter(Boolean).join(" → ");
              return (
                <tr key={`${it.type}-${it.id}`} style={{ borderBottom: "1px solid #eef2ee", verticalAlign: "top" }}>
                  <td style={td}><span style={badge(it.type)}>{it.type === "candidate" ? "候选路线" : "线路上报"}</span></td>
                  <td style={td}>{it.route_name ?? it.route_id ?? "-"}</td>
                  <td style={td}>{(it.province_name ?? "") + (it.city_name ? " " + it.city_name : "")}</td>
                  <td style={td}>{it.submitter_name ?? "-"}</td>
                  <td style={td}>{it.submitter_contact ?? "-"}</td>
                  <td style={td}>{new Date(it.submitted_at).toLocaleString("zh-CN")}</td>
                  <td style={{ ...td, color: "#3a4a40" }}>
                    {points ? <div>节点：{points}</div> : null}
                    {detail?.user_description ? <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{detail.user_description}</div> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}

const th: React.CSSProperties = { padding: "10px 8px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "10px 8px" };

function badge(type: string): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    background: type === "candidate" ? "#e6f4ec" : "#eef1f6",
    color: type === "candidate" ? "#1d7c57" : "#4a586a",
  };
}
