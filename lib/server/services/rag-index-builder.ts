/**
 * rag-index-builder.ts —— 阶段 2 索引构建（TS 版，与 scripts/build-rag-index.py 同 schema）
 *
 * 用途：发布新线路 / 线路数据变更后，由 route-publish-service 调用本模块重建
 * data/rag/route-index.json，保证 RAG 索引与语料一致（堵「发布不刷新索引」的洞）。
 *
 * 切片策略（每条线路 4 类 chunk，覆盖不同检索意图）：
 *   identity    名称/省市/区/类型
 *   profile     难度/里程/耗时/路面/季节/起终点
 *   description narrative 描述 + 新手理由（语义）
 *   geo         城市/区/起终点 POI（地理位置）
 */

import fs from "fs";
import path from "path";
import { embedTexts } from "../integrations/embedding-client";
import type { RouteCard } from "./route-vector-retriever";

const TYPE_LABEL: Record<string, string> = { out_and_back: "往返线", loop: "环线", one_way: "单向穿越" };
const DIFF_LABEL: Record<string, string> = { easy: "新手友好", moderate: "中等强度" };

type RawRoute = {
  route_id?: string;
  base_facts?: Record<string, unknown>;
  narrative?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  geometry?: Record<string, unknown>;
};

function asStr(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function buildChunks(route: RawRoute): Array<{ chunk_type: string; text: string }> {
  const bf = route.base_facts ?? {};
  const nar = route.narrative ?? {};
  const m = route.metrics ?? {};

  const name = asStr(bf.route_name);
  const prov = asStr(bf.province_name);
  const city = asStr(bf.city_name);
  const area = asStr(bf.area_name);
  const rtype = asStr(bf.route_type);
  const rtypeLbl = TYPE_LABEL[rtype] ?? rtype;
  const diff = asStr(bf.difficulty_band);
  const diffLbl = DIFF_LABEL[diff] ?? diff;
  const surfaces = (Array.isArray(bf.surface_tags) ? bf.surface_tags : []).map(asStr).filter(Boolean).join("、");
  const seasons = (Array.isArray(bf.season_tags) ? bf.season_tags : []).map(asStr).filter(Boolean).join("、");
  const dist = m.distance_km;
  const dur = m.duration_hours;
  const start = asStr(bf.start_point_name);
  const end = asStr(bf.end_point_name);
  const kw = asStr(bf.map_search_keyword);
  const summary = asStr(nar.summary_short);
  const fit = asStr(nar.beginner_fit_reason);
  const desc = asStr(nar.description);

  const distTxt = typeof dist === "number" ? `约 ${dist} 公里` : "里程待补";
  const durTxt = typeof dur === "number" ? `约 ${dur} 小时` : "耗时待补";

  return [
    { chunk_type: "identity", text: `${name}｜位于${prov}${city}${area}｜${rtypeLbl}｜${diffLbl}` },
    {
      chunk_type: "profile",
      text:
        `${name}是一条${diffLbl}的${rtypeLbl}，${distTxt}，${durTxt}。` +
        `路面：${surfaces || "未标注"}。适宜季节：${seasons || "未标注"}。` +
        `起点：${start}；终点：${end}。`,
    },
    { chunk_type: "description", text: `${desc} ${fit}`.trim() || summary },
    {
      chunk_type: "geo",
      text: `${prov}${city}${area}的徒步线路：${name}。起点${start}，终点${end}。检索词：${kw}。`,
    },
  ];
}

function buildRouteCard(route: RawRoute): RouteCard {
  const bf = route.base_facts ?? {};
  const nar = route.narrative ?? {};
  const m = route.metrics ?? {};
  const geom = route.geometry ?? {};
  const dist = m.distance_km;
  const dur = m.duration_hours;
  const ascent = m.ascent_m;
  return {
    route_id: asStr(route.route_id),
    route_name: asStr(bf.route_name) || undefined,
    province_name: asStr(bf.province_name) || undefined,
    city_name: asStr(bf.city_name) || undefined,
    area_name: asStr(bf.area_name) || undefined,
    difficulty_band: asStr(bf.difficulty_band) || undefined,
    difficulty_label: DIFF_LABEL[asStr(bf.difficulty_band)] || asStr(bf.difficulty_band) || undefined,
    route_type: asStr(bf.route_type) || undefined,
    route_type_label: asStr(bf.route_type_label) || TYPE_LABEL[asStr(bf.route_type)] || asStr(bf.route_type) || undefined,
    distance_km: typeof dist === "number" ? dist : null,
    duration_hours: typeof dur === "number" ? dur : null,
    ascent_m: typeof ascent === "number" ? ascent : null,
    surface_tags: (Array.isArray(bf.surface_tags) ? bf.surface_tags : []).map(asStr).filter(Boolean),
    season_tags: (Array.isArray(bf.season_tags) ? bf.season_tags : []).map(asStr).filter(Boolean),
    start_point_name: asStr(bf.start_point_name) || undefined,
    end_point_name: asStr(bf.end_point_name) || undefined,
    summary_short: asStr(nar.summary_short) || undefined,
    description: asStr(nar.description) || undefined,
    geometry_status: asStr(geom.geocode_status) || undefined,
  };
}

export type BuildRouteIndexResult = { routeCount: number; chunkCount: number; outPath: string };

export async function buildRouteIndex(opts?: {
  routesDir?: string;
  outPath?: string;
}): Promise<BuildRouteIndexResult> {
  const routesDir = opts?.routesDir ?? path.join(process.cwd(), "data", "routes");
  const outPath = opts?.outPath ?? path.join(process.cwd(), "data", "rag", "route-index.json");

  const files = fs
    .readdirSync(routesDir)
    .filter((f) => f.startsWith("rt_") && f.endsWith(".json"))
    .map((f) => path.join(routesDir, f));

  const routes: RawRoute[] = files.map((f) => JSON.parse(fs.readFileSync(f, "utf-8")) as RawRoute);

  const chunks: Array<{ route_id: string; route_name: string; city_name: string; chunk_type: string; text: string }> = [];
  const routeCards: Record<string, RouteCard> = {};
  for (const r of routes) {
    const rid = asStr(r.route_id);
    routeCards[rid] = buildRouteCard(r);
    const bf = r.base_facts ?? {};
    for (const c of buildChunks(r)) {
      chunks.push({
        route_id: rid,
        route_name: asStr(bf.route_name),
        city_name: asStr(bf.city_name),
        chunk_type: c.chunk_type,
        text: c.text,
      });
    }
  }

  const embeddings = await embedTexts(chunks.map((c) => c.text));
  const outChunks = chunks.map((c, i) => ({
    chunk_id: `c${String(i).padStart(4, "0")}`,
    route_id: c.route_id,
    route_name: c.route_name,
    city_name: c.city_name,
    chunk_type: c.chunk_type,
    text: c.text,
    embedding: embeddings[i],
  }));

  const index = {
    built_at: new Date().toISOString(),
    model: "text-embedding-v3",
    dim: embeddings[0]?.length ?? 1024,
    route_count: routes.length,
    chunk_count: outChunks.length,
    route_cards: routeCards,
    chunks: outChunks,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(index, null, 2), "utf-8");
  return { routeCount: routes.length, chunkCount: outChunks.length, outPath };
}
