import fs from "fs";
import path from "path";
import type { CreateRouteCandidateDTO } from "../dto/public-route-submissions";

/**
 * 投稿落盘存储：让 memory 模式（Cloud Studio 沙箱）下的用户投稿不再只存内存、
 * 重启/重部署即丢失，而是持久化到 data/submissions/，供后台查看与审核。
 *
 * 注意：沙箱文件系统仅在实例存活期间持久；频繁重部署会清空。
 * 如需跨重部署 durable，请切到 pg 模式（DATABASE_URL + db/migrations）。
 */

const SUBMISSIONS_DIR = path.join(process.cwd(), "data", "submissions");
const INDEX_FILE = path.join(SUBMISSIONS_DIR, "_index.json");

export type SubmissionSummary = {
  type: "candidate" | "report";
  id: string;
  route_id?: string;
  route_name?: string;
  province_name?: string;
  city_name?: string;
  submitted_at: string;
  submitter_name?: string;
  submitter_contact?: string;
  file: string;
};

type SavedCandidate = { route_id: string; route_name?: string; province_name?: string; city_name?: string; updated_at: string };

function ensureDir() {
  fs.mkdirSync(SUBMISSIONS_DIR, { recursive: true });
}

function readIndex(): SubmissionSummary[] {
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf-8")) as SubmissionSummary[];
  } catch {
    return [];
  }
}

function upsert(summary: SubmissionSummary, detail: unknown) {
  try {
    ensureDir();
    fs.writeFileSync(path.join(SUBMISSIONS_DIR, summary.file), JSON.stringify(detail, null, 2));
    const items = readIndex().filter((x) => !(x.type === summary.type && x.id === summary.id));
    items.unshift(summary);
    fs.writeFileSync(INDEX_FILE, JSON.stringify(items, null, 2));
  } catch (cause) {
    // 落盘失败不应阻断投稿主流程，仅记录
    console.error("[submission-store] persist failed:", cause);
  }
}

export function saveCandidate(input: CreateRouteCandidateDTO, record: SavedCandidate) {
  upsert(
    {
      type: "candidate",
      id: record.route_id,
      route_id: record.route_id,
      route_name: record.route_name,
      province_name: record.province_name,
      city_name: record.city_name,
      submitted_at: record.updated_at,
      submitter_name: input.submitter_name,
      submitter_contact: input.submitter_contact,
      file: path.join("candidates", `${record.route_id}.json`),
    },
    { input, record },
  );
}

export function saveUserReport(routeId: string, report: { report_id: string; proposal_text?: string }) {
  const submitter = report.proposal_text?.includes("投稿人：")
    ? report.proposal_text.split("投稿人：")[1]?.trim()
    : undefined;
  upsert(
    {
      type: "report",
      id: report.report_id,
      route_id: routeId,
      submitted_at: new Date().toISOString(),
      submitter_name: submitter,
      file: path.join("reports", `${routeId}_${report.report_id}.json`),
    },
    { route_id: routeId, report },
  );
}

export function listSubmissions(): SubmissionSummary[] {
  return readIndex();
}
