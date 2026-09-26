import { NextRequest } from "next/server";
import { ok, error } from "../../../lib/server/api/admin-response";
import {
  getRouteRetriever,
  isRouteRagConfigured,
} from "../../../lib/server/services/route-vector-retriever";

/**
 * 出发前 checklist 接口（GET /api/route-checklist?routeId=xxx）
 *
 * 设计要点（与决策文档「防幻觉」一致）：
 *   - 不调用 LLM、不联网，纯从线路 RAG chunks 抽取，绝不编造资料外内容；
 *   - 按固定维度（装备/补水/补给/交通/天气/难度/安全/时间）扫描线路文本，
 *     命中相关句子即作为清单条目，未命中维度明确标注「资料未提及」；
 *   - getRouteChunks 只读取已构建索引（文件化），不触发 embedding，开销极低。
 */
export type ChecklistItem = {
  dimension: string;
  label: string;
  mentioned: boolean;
  quotes: string[];
};

const DIMENSIONS: Array<{ dimension: string; label: string; keywords: string[] }> = [
  { dimension: "gear", label: "装备 / 衣物", keywords: ["装备", "穿着", "衣物", "鞋", "登山杖", "头灯", "冲锋衣", "雨衣", "背包"] },
  { dimension: "water", label: "补水", keywords: ["补水", "饮水", "带水", "水源", "水"] },
  { dimension: "supply", label: "补给 / 能量", keywords: ["补给", "干粮", "食物", "能量", "路餐", "零食", "吃"] },
  { dimension: "transit", label: "交通 / 入口", keywords: ["入口", "起点", "地铁", "公交", "停车", "自驾", "交通", "怎么去", "直达"] },
  { dimension: "weather", label: "天气 / 季节", keywords: ["天气", "季节", "雨季", "高温", "防晒", "防寒", "气候", "秋", "夏", "春", "冬"] },
  { dimension: "difficulty", label: "难度 / 路况", keywords: ["难度", "路况", "坡度", "碎石", "湿滑", "陡", "技术", "平缓", "台阶"] },
  { dimension: "safety", label: "安全 / 下撤", keywords: ["安全", "下撤", "风险", "迷路", "信号", "应急", "救援", "岔路"] },
  { dimension: "time", label: "时间 / 时长", keywords: ["耗时", "时长", "时间", "天黑", "日落", "出发", "小时"] },
];

// 每个维度保留的引用句上限。原为 2，导致清单内容明显缺失（用户反馈「显示不完整」）；
// 放宽到 6：覆盖该维度的主要原文，同时避免个别长文把清单撑得过长。
const MAX_QUOTES_PER_DIM = 6;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？；.!?;])/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function buildChecklist(chunks: Array<{ chunk_type: string; text: string }>): ChecklistItem[] {
  const sentences = chunks.flatMap((chunk) => splitSentences(chunk.text));
  return DIMENSIONS.map((dim) => {
    const quotes: string[] = [];
    for (const sentence of sentences) {
      if (quotes.length >= MAX_QUOTES_PER_DIM) break;
      if (dim.keywords.some((kw) => sentence.includes(kw)) && !quotes.includes(sentence)) {
        quotes.push(sentence);
      }
    }
    return {
      dimension: dim.dimension,
      label: dim.label,
      mentioned: quotes.length > 0,
      quotes,
    };
  });
}

export async function GET(request: NextRequest) {
  const routeId = request.nextUrl.searchParams.get("routeId")?.trim();
  if (!routeId) {
    return error("INVALID_REQUEST", "routeId 不能为空", 400, "req_checklist");
  }
  if (!isRouteRagConfigured()) {
    return error("RAG_NOT_READY", "RAG 检索未就绪：请配置 AGENT_PREFILL_API_KEY 并构建索引", 500, "req_checklist");
  }

  const retriever = getRouteRetriever();
  const chunks = await retriever.getRouteChunks(routeId);
  if (!chunks) {
    return error("ROUTE_NOT_FOUND", `线路不存在：${routeId}`, 404, "req_checklist");
  }

  const routes = await retriever.listRoutes();
  const meta = routes.find((r) => r.route_id === routeId);
  const routeName = meta?.route_name ?? routeId;

  return ok({ route_id: routeId, route_name: routeName, items: buildChecklist(chunks) }, "req_checklist");
}
