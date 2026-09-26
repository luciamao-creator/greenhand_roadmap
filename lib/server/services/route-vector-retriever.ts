/**
 * route-vector-retriever.ts —— 阶段 2 运行时检索（文件化 + 内存余弦）
 *
 * 设计（与决策文档 §5 一致）：
 *   - 向量存储：文件化（data/rag/route-index.json），不引入 pgvector；
 *     切换阈值：chunk 数 > 5000 或需要在线增量写入时再换 PgVectorRetriever。
 *   - 检索层抽象为 Retriever 接口，本文件提供 FileVectorRetriever 实现。
 *   - 防幻觉：检索结果只返回知识库内线路，每条带 matched_chunk 作为可点开溯源依据。
 *
 * 检索流程：用户 query → 百炼向量化 → 对索引内所有 chunk 做余弦 →
 * 按 route 聚合（取最高分 chunk）→ 返回 top-K route。
 */

import fs from "fs";
import path from "path";
import { embedTexts, isEmbeddingConfigured } from "../integrations/embedding-client";

export type RouteCard = {
  route_id: string;
  route_name: string | undefined;
  province_name: string | undefined;
  city_name: string | undefined;
  area_name: string | undefined;
  difficulty_band: string | undefined;
  difficulty_label: string | undefined;
  route_type: string | undefined;
  route_type_label: string | undefined;
  distance_km: number | null;
  duration_hours: number | null;
  ascent_m: number | null;
  surface_tags: string[];
  season_tags: string[];
  start_point_name: string | undefined;
  end_point_name: string | undefined;
  summary_short: string | undefined;
  description: string | undefined;
  geometry_status: string | undefined;
};

export type RetrievalResult = {
  route_id: string;
  route_name: string;
  city_name: string;
  score: number;
  /** 命中该 route 的最佳 chunk 类型，作为可点开溯源的依据 */
  matched_chunk_type: string;
  matched_text: string;
  route_card: RouteCard | undefined;
};

/** 线路元信息：用于多轮对话中的指代解析（线路名匹配 / 城市词表） */
export type RouteMeta = {
  route_id: string;
  route_name: string;
  province_name: string;
  city_name: string;
  area_name: string | undefined;
};

export interface Retriever {
  /** 推荐模式：跨全库召回 top-K 线路 */
  retrieve(query: string, topK?: number): Promise<RetrievalResult[]>;
  /** 聚焦模式：只针对单条线路，返回其与 query 最相关的 chunk；线路不存在返回 null */
  retrieveForRoute(query: string, routeId: string): Promise<RetrievalResult | null>;
  /** 聚焦模式的上下文：返回单条线路的全部 chunk 文本 */
  getRouteChunks(routeId: string): Promise<Array<{ chunk_type: string; text: string }> | null>;
  /** 线路元信息列表 */
  listRoutes(): Promise<RouteMeta[]>;
  /** 线路卡片列表（含难度/类型/里程等，供前端推荐流/地图使用） */
  listRouteCards(): Promise<RouteCard[]>;
}

type RagChunk = {
  chunk_id: string;
  route_id: string;
  route_name: string;
  city_name: string;
  chunk_type: string;
  text: string;
  embedding: number[];
};

type RagIndex = {
  built_at: string;
  model: string;
  dim: number;
  route_count: number;
  chunk_count: number;
  route_cards: Record<string, RouteCard>;
  chunks: RagChunk[];
};

function resolveIndexPath(): string {
  return path.join(process.cwd(), "data", "rag", "route-index.json");
}

/**
 * 定性特征词同义词表：用于检索召回增强。
 * 向量检索对「红叶/赏枫/看海/瀑布」这类定性特征词召回偏弱，容易漏掉库内已有线路。
 * 这里在向量余弦之外，叠加「查询特征词 ↔ 线路文本（简介/描述/标签）词面命中」的提升，
 * 并对查询做同义词扩展后重新向量化，保证特征类 query 能召回对应线路。
 */
const FEATURE_SYNONYMS: Record<string, string[]> = {
  红叶: ["红叶", "赏枫", "枫", "红枫", "枫叶", "秋色", "红叶季"],
  海景: ["海", "观海", "看海", "海景", "临海", "海岸"],
  瀑布: ["瀑布"],
  古道: ["古道"],
  亲子: ["亲子", "带娃", "小孩", "家庭", "儿童"],
  人文: ["人文", "文化", "古迹", "书院", "寺庙", "道观", "古寺"],
  避暑: ["避暑", "清凉", "凉快", "消暑", "纳凉"],
  赏花: ["花", "山花", "春花", "花海", "花季"],
  视野: ["视野", "观景", "眺望", "全景", "俯瞰"],
};

/** 词面提升权重：命中任一激活特征的同义词即 +BOOST（在聚合排序前叠加） */
const FEATURE_BOOST = 0.12;

function activeFeatureGroups(query: string): string[] {
  return Object.entries(FEATURE_SYNONYMS)
    .filter(([, syms]) => syms.some((s) => query.includes(s)))
    .map(([group]) => group);
}

/** 用同义词扩展查询文本，提升向量召回 */
function expandQuery(query: string): string {
  const groups = activeFeatureGroups(query);
  if (groups.length === 0) return query;
  const syms = [...new Set(groups.flatMap((g) => FEATURE_SYNONYMS[g]))];
  return `${query} ${syms.join(" ")}`;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

class FileVectorRetriever implements Retriever {
  private cache: RagIndex | null = null;

  constructor(private readonly filePath: string = resolveIndexPath()) {}

  private load(): RagIndex {
    if (!this.cache) {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      this.cache = JSON.parse(raw) as RagIndex;
    }
    return this.cache;
  }

  async retrieve(query: string, topK = 5): Promise<RetrievalResult[]> {
    const index = this.load();
    const expanded = expandQuery(query);
    const queryVecs = await embedTexts(expanded === query ? [query] : [query, expanded]);
    const activeGroups = activeFeatureGroups(query);

    // chunk 级余弦打分（取多条查询向量的最高相似度）
    const scored = index.chunks.map((chunk) => {
      let sim = 0;
      for (const vec of queryVecs) sim = Math.max(sim, cosine(vec, chunk.embedding));
      return {
        routeId: chunk.route_id,
        sim,
        chunkType: chunk.chunk_type,
        text: chunk.text,
      };
    });

    // 按 route 聚合：取最高分 chunk
    const bestByRoute = new Map<string, { score: number; chunkType: string; text: string }>();
    for (const item of scored) {
      const prev = bestByRoute.get(item.routeId);
      if (!prev || item.sim > prev.score) {
        bestByRoute.set(item.routeId, { score: item.sim, chunkType: item.chunkType, text: item.text });
      }
    }

    // 特征词面提升：命中激活特征同义词的线路整条加分，保证特征类 query 召回
    const ranked = [...bestByRoute.entries()]
      .map(([routeId, info]) => {
        let score = info.score;
        if (activeGroups.length > 0) {
          const card = index.route_cards[routeId];
          if (card) {
            const haystack = [
              card.summary_short,
              card.description,
              (card.surface_tags ?? []).join(" "),
              (card.season_tags ?? []).join(" "),
            ]
              .filter(Boolean)
              .join(" ");
            const hit = activeGroups.some((g) => FEATURE_SYNONYMS[g].some((s) => haystack.includes(s)));
            if (hit) score += FEATURE_BOOST;
          }
        }
        return [routeId, { score, chunkType: info.chunkType, text: info.text }] as [
          string,
          { score: number; chunkType: string; text: string },
        ];
      })
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, topK);

    return ranked.map(([routeId, info]) => {
      const card = index.route_cards[routeId];
      return {
        route_id: routeId,
        route_name: card?.route_name ?? "",
        city_name: card?.city_name ?? "",
        score: info.score,
        matched_chunk_type: info.chunkType,
        matched_text: info.text,
        route_card: card,
      };
    });
  }

  async retrieveForRoute(query: string, routeId: string): Promise<RetrievalResult | null> {
    const index = this.load();
    const card = index.route_cards[routeId];
    if (!card) return null;

    const chunks = index.chunks.filter((chunk) => chunk.route_id === routeId);
    if (chunks.length === 0) return null;

    const [queryVec] = await embedTexts([query]);
    let best = chunks[0];
    let bestSim = -Infinity;
    for (const chunk of chunks) {
      const sim = cosine(queryVec, chunk.embedding);
      if (sim > bestSim) {
        bestSim = sim;
        best = chunk;
      }
    }

    return {
      route_id: routeId,
      route_name: card.route_name ?? "",
      city_name: card.city_name ?? "",
      score: bestSim,
      matched_chunk_type: best.chunk_type,
      matched_text: best.text,
      route_card: card,
    };
  }

  async getRouteChunks(routeId: string): Promise<Array<{ chunk_type: string; text: string }> | null> {
    const index = this.load();
    if (!index.route_cards[routeId]) return null;
    return index.chunks
      .filter((chunk) => chunk.route_id === routeId)
      .map((chunk) => ({ chunk_type: chunk.chunk_type, text: chunk.text }));
  }

  async listRoutes(): Promise<RouteMeta[]> {
    const index = this.load();
    return Object.values(index.route_cards).map((card) => ({
      route_id: card.route_id,
      route_name: card.route_name ?? "",
      province_name: card.province_name ?? "",
      city_name: card.city_name ?? "",
      area_name: card.area_name,
    }));
  }

  async listRouteCards(): Promise<RouteCard[]> {
    const index = this.load();
    return Object.values(index.route_cards);
  }
}

export function isRouteRagConfigured(): boolean {
  return isEmbeddingConfigured() && fs.existsSync(resolveIndexPath());
}

/** 仅判断索引文件是否存在（列线路/读卡片不需要 embedding，避免缺 key 时首页空） */
export function isRouteIndexBuilt(): boolean {
  return fs.existsSync(resolveIndexPath());
}

let singleton: Retriever | null = null;

export function getRouteRetriever(): Retriever {
  if (!singleton) {
    singleton = new FileVectorRetriever();
  }
  return singleton;
}
