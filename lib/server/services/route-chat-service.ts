/**
 * route-chat-service.ts —— 阶段 3 C 端 chatbot「什么路线适合我」+ 溯源
 *
 * 两种模式（关键）：
 *   - recommend（推荐模式）：跨全库检索 top-K，挑 1-3 条推荐，溯源面板列候选。
 *   - focus（聚焦模式）：用户已锁定某一条线路（如「青城山那条线」），只针对它回答，
 *     不再推荐其他线路，溯源面板只保留这一条。
 *
 * 多轮对话（关键）：每轮请求可携带 history 与 focus_route_id。服务端据「当前 query 是否
 * 点名线路 / 是否含城市词 / 是否明显在要新推荐」来解析本轮聚焦哪条线，解决两类断裂：
 *   1. 单线路问答时仍夹带其他线路推荐；
 *   2. 后续追问缺省指代词（如「相比其他路线我要注意什么」）被当成全新检索。
 *
 * 排序口径：检索层返回的是「候选集」（按向量余弦分降序），推荐顺序是 LLM 的二次判断，
 * 可能重排候选。因此 LLM 额外返回 recommended_route_ids，sources 以「推荐顺序优先、
 * 其余候选按检索分随后」返回。
 *
 * 每轮写埋点 trace（data/rag/chat-trace.jsonl），字段对齐决策文档 §9。
 *
 * 防幻觉核心约束：LLM 只能引用本轮提供的线路资料，不得编造知识库外内容。
 */

import fs from "fs";
import path from "path";
import {
  getRouteRetriever,
  isRouteRagConfigured,
  type RetrievalResult,
  type RouteCard,
  type RouteMeta,
} from "./route-vector-retriever";
// 纯路由逻辑（无副作用）已抽到 route-chat-routing.ts，这里只引用，不重复定义
import {
  type RouteAlias,
  type TurnIntent,
  resolveTurnIntent,
  scanOutOfLibraryEntity,
  LIB_GEO_UNKNOWN,
} from "./route-chat-routing";
// 实时上下文（高德天气等）：按需注入，保持防幻觉边界
import { buildLiveContext } from "./live-context";

const CHAT_API_URL =
  process.env.AGENT_PREFILL_API_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const CHAT_API_KEY = process.env.AGENT_PREFILL_API_KEY;
const CHAT_MODEL = process.env.AGENT_PREFILL_MODEL ?? "qwen-plus";

/** chunk_type → 可点开溯源时展示的中文标签 */
const CHUNK_TYPE_LABEL: Record<string, string> = {
  identity: "身份/位置",
  profile: "难度与里程",
  description: "线路描述",
  geo: "地理检索",
};

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ChatSource = {
  route_id: string;
  route_name: string;
  city_name: string;
  score: number;
  /** 是否被 LLM 实际推荐（溯源模块据此区分「推荐依据」与「其他候选」） */
  recommended: boolean;
  matched_chunk_type: string;
  matched_chunk_label: string;
  matched_text: string;
  route_card: RouteCard | undefined;
};

export type ChatMetrics = {
  retrieve_ms: number;
  answer_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  topK: number;
};

/** 不调检索/模型、直接返回写死文案的兜底分支 */
export type FallbackReason =
  | "clarify_missing_city"
  | "out_of_city"
  | "out_of_library"
  | "region_empty";

export type ChatAnswer = {
  answer: string;
  sources: ChatSource[];
  /** 本轮聚焦的线路 id；recommend 模式下为 null */
  focus_route_id: string | null;
  mode: "recommend" | "focus";
  /**
   * 兜底原因：null = 本轮真的走了「检索 + 生成」；非 null = 命中兜底文案（metrics 全 0）。
   *
   * 为什么要显式建模：这些分支的 mode 也是 "recommend"、sources 为空、metrics 全 0，
   * 与「推荐了但候选为空」在协议上无法区分 —— 于是前端一律显示「推荐模式」、
   * 评测只断言 mode 就能假通过、埋点里也看不到它们。静默降级因此长期隐身。
   */
  fallback_reason: FallbackReason | null;
  metrics: ChatMetrics;
};

export type AnswerRouteQueryOptions = {
  topK?: number;
  /** 客户端携带的当前聚焦线路（上一轮继承） */
  focusRouteId?: string;
  /** 最近若干轮对话，用于理解指代 */
  history?: ChatTurn[];
};

export class RouteChatServiceError extends Error {}

// --------------------------------------------------------------------------- //
// 指代解析：本轮聚焦哪条线？
// --------------------------------------------------------------------------- //

/** 线路名里的通用后缀（按长度从长到短匹配，避免「登山步道」被拆成「步道」） */
const ROUTE_NAME_SUFFIXES = [
  "登山步道",
  "登山古道",
  "郊野公园",
  "郊野径",
  "健康步道",
  "健身步道",
  "轻徒步线",
  "登山道",
  "步道",
  "古道",
  "绿道",
  "北线",
  "南线",
  "线",
  "径",
];

/** 去掉通用后缀，得到用户口语里更可能使用的「核心名」（如 宝石山步道 → 宝石山） */
function routeCore(name: string): string {
  for (const suffix of ROUTE_NAME_SUFFIXES) {
    if (name.endsWith(suffix) && name.length > suffix.length) {
      return name.slice(0, name.length - suffix.length);
    }
  }
  return name;
}

/**
 * 为每条线路生成别名表：全名、核心名，以及核心名的 >=3 字前缀。
 *
 * 这里刻意不用「最长公共子串 + 通用词黑名单」的做法：那种写法会把
 * 「宝石山步道」这种【含通用后缀的完整线路名】误判成通用词而整条丢弃，
 * 导致用户点名线路时反而进不了聚焦模式（该 bug 由评测集 L2-002 抓出）。
 */
function buildAliasIndex(routes: RouteMeta[]): RouteAlias[] {
  const aliasIndex: RouteAlias[] = [];
  for (const route of routes) {
    if (!route.route_name) continue;
    const aliases = new Set<string>([route.route_name]);
    const core = routeCore(route.route_name);
    if (core.length >= 2) aliases.add(core);
    // 核心名的 >=3 字前缀：让「青城山」能命中「青城山前山步道」，
    // 同时避免「厦门山海健康步道」的 2 字前缀「厦门」把城市名当线路名
    for (let len = 3; len < core.length; len++) {
      aliases.add(core.slice(0, len));
    }
    for (const alias of aliases) aliasIndex.push({ alias, route });
  }
  return aliasIndex;
}

/** 当前 query 是否点名了某条线路：取命中的最长别名 */
function findNamedRoute(query: string, aliasIndex: RouteAlias[], geoSet: Set<string>): RouteMeta | null {
  let best: RouteMeta | null = null;
  let bestLen = 0;
  for (const { alias, route } of aliasIndex) {
    if (alias.length <= bestLen) continue;
    // 城市/地区名本身不算点名某条线路（如「厦门」≠「厦门山海健康步道」）
    if (geoSet.has(alias)) continue;
    if (!query.includes(alias)) continue;
    best = route;
    bestLen = alias.length;
  }
  return best;
}

function buildGeoTokenSet(routes: RouteMeta[]): Set<string> {
  const set = new Set<string>();
  for (const route of routes) {
    for (const token of [route.province_name, route.city_name, route.area_name]) {
      if (token && token.length >= 2) set.add(token);
    }
  }
  return set;
}

function queryHasGeoToken(query: string, geoSet: Set<string>): boolean {
  for (const token of geoSet) {
    if (query.includes(token)) return true;
  }
  return false;
}

/**
 * 从对话历史回溯用户最近一次点名的线路。
 * 只看 user 轮次：assistant 回答里会提到多条线路名，据它推断聚焦会引入错误。
 * 这样即使客户端没携带 focus_route_id（旧页面 / 硬刷新后），服务端仍能维持多轮语义连续。
 */
function deriveFocusFromHistory(
  history: ChatTurn[] | undefined,
  aliasIndex: RouteAlias[],
  geoSet: Set<string>,
): string | null {
  if (!history || history.length === 0) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role !== "user") continue;
    const named = findNamedRoute(turn.content, aliasIndex, geoSet);
    if (named) return named.route_id;
  }
  return null;
}

function resolveFocusRouteId(
  query: string,
  aliasIndex: RouteAlias[],
  geoSet: Set<string>,
  carriedFocusId: string | undefined,
  intent: TurnIntent,
): string | null {
  // 1) 当前 query 点名了某条线路 → 聚焦它
  const named = findNamedRoute(query, aliasIndex, geoSet);
  if (named) return named.route_id;

  // 2) 本轮是新的检索请求 → 退出聚焦（决策文档 §3.3 聚焦退出率）
  // 例外：已有聚焦 + 本轮仅含弱疑问词（如「有什么亮点」「介绍一下」）——
  // 这是对聚焦线路的属性追问，不应仅凭「什么」二字打散聚焦；
  // 强信号（推荐/换一条/别的…）与地域词仍会正常退出聚焦。
  if (intent.newRequest && !(carriedFocusId && intent.weakNewOnly)) return null;

  // 3) 出现新的城市/地区词 → 视为新检索意图
  //    仅在本轮带新检索信号（推荐/换一条…）时才退出聚焦；
  //    纯追问里出现地名（聚焦「仰天窝」后问「距离成都市区多远」）是针对聚焦线路的
  //    属性提问，不应仅凭地名就把聚焦打散（否则会退回推荐模式、把全部候选都答一遍）。
  if (queryHasGeoToken(query, geoSet)) {
    return intent.newRequest ? null : (carriedFocusId ?? null);
  }

  // 4) 延续上一轮 → 继承聚焦线路（追问场景）
  return carriedFocusId ?? null;
}

// --------------------------------------------------------------------------- //
// 地域约束 / 库外实体 / 澄清（P0 + P2 + P3）
// --------------------------------------------------------------------------- //

// 省份/城市词表与 LIB_GEO_UNKNOWN 已迁至 route-chat-routing.ts

/** 省份相邻表（用于「周边省份」扩展） */
const PROVINCE_NEIGHBORS: Record<string, string[]> = {
  广东: ["福建", "湖南", "江西", "广西", "海南"],
  上海: ["江苏", "浙江", "安徽"],
  辽宁: ["河北", "山东", "吉林", "内蒙古"],
  福建: ["浙江", "江西", "广东"],
  江苏: ["浙江", "安徽", "上海", "山东"],
  四川: ["重庆", "陕西", "云南", "贵州", "甘肃"],
  湖北: ["湖南", "河南", "安徽", "江西", "陕西"],
  重庆: ["四川", "贵州", "湖北", "湖南", "陕西"],
  湖南: ["湖北", "广东", "江西", "广西", "贵州"],
  浙江: ["江苏", "安徽", "上海", "江西", "福建"],
  安徽: ["江苏", "浙江", "湖北", "江西", "河南", "山东"],
  陕西: ["山西", "河南", "甘肃", "四川", "湖北", "宁夏", "内蒙古"],
  河南: ["河北", "山西", "陕西", "湖北", "安徽", "山东", "江苏"],
  山东: ["江苏", "安徽", "河南", "河北", "辽宁"],
  河北: ["北京", "天津", "山西", "山东", "河南", "辽宁", "内蒙古"],
  山西: ["陕西", "河南", "河北", "内蒙古"],
  江西: ["湖北", "湖南", "安徽", "浙江", "福建", "广东"],
  广西: ["广东", "湖南", "贵州", "云南"],
  贵州: ["四川", "重庆", "湖南", "广西", "云南"],
  云南: ["四川", "贵州", "广西", "西藏"],
  甘肃: ["陕西", "四川", "青海", "新疆", "内蒙古", "宁夏"],
  青海: ["甘肃", "西藏", "新疆"],
  宁夏: ["陕西", "甘肃", "内蒙古"],
  内蒙古: ["山西", "陕西", "宁夏", "甘肃", "河北", "辽宁", "黑龙江"],
  新疆: ["甘肃", "青海", "西藏"],
  西藏: ["青海", "新疆", "云南", "四川"],
  黑龙江: ["吉林", "内蒙古", "辽宁"],
  吉林: ["黑龙江", "辽宁", "内蒙古"],
  海南: ["广东", "广西"],
  天津: ["北京", "河北", "山东"],
};

type LibGeo = { province: string; city: string };

/** 城市/地区名 → {province, city}（用于地域过滤） */
function buildLibGeoMap(routes: RouteMeta[]): Map<string, LibGeo> {
  const map = new Map<string, LibGeo>();
  for (const r of routes) {
    if (r.province_name) map.set(r.province_name, { province: r.province_name, city: r.province_name });
    if (r.city_name) map.set(r.city_name, { province: r.province_name, city: r.city_name });
    if (r.area_name) map.set(r.area_name, { province: r.province_name, city: r.city_name });
  }
  return map;
}

type GeoScope =
  | { kind: "none" }
  | { kind: "clarify" }
  | { kind: "out_city"; city: string }
  | { kind: "region"; provinces: string[] };

/**
 * 解析查询的地域范围：
 *  - 命中库外城市/省份 → out_city（如实说明无匹配）
 *  - 命中库内城市/省份 → region（按省份过滤候选；「周边/周围省份」扩展到邻省并排除本省）
 *  - 无地域词但含地点探询（去哪里/附近…）→ clarify
 *  - 其余 → none（交给推荐模式）
 */
function resolveGeoScope(
  query: string,
  libGeoSet: Set<string>,
  libGeoMap: Map<string, LibGeo>,
): GeoScope {
  // 1) 库外城市/省份
  for (const token of LIB_GEO_UNKNOWN) {
    if (query.includes(token) && !libGeoSet.has(token)) {
      return { kind: "out_city", city: token };
    }
  }

  // 2) 库内地域词
  const matched: LibGeo[] = [];
  for (const [token, geo] of libGeoMap) {
    if (query.includes(token)) matched.push(geo);
  }
  if (matched.length === 0) {
    if (/去哪里|适合去哪|推荐.{0,4}地方|附近.{0,4}徒步|哪里.*徒步|徒步.*哪里/.test(query)) {
      return { kind: "clarify" };
    }
    return { kind: "none" };
  }

  const neighbor = /周边|周围|附近|邻近/.test(query);
  const excludeHome = neighbor && /省份|省/.test(query);
  const homeProvinces = new Set(matched.map((m) => m.province));
  const provinces = new Set<string>();
  if (!excludeHome) for (const p of homeProvinces) provinces.add(p);
  if (neighbor) {
    for (const m of matched) {
      for (const n of PROVINCE_NEIGHBORS[m.province] ?? []) provinces.add(n);
    }
  }
  return { kind: "region", provinces: [...provinces] };
}

// 实体识别（边界字 / 后缀表 / 泛化词黑名单 / scanOutOfLibraryEntity）已迁至 route-chat-routing.ts

/**
 * 本轮 query 是否【新点名词典外的山体/线路】。
 *
 * 口径与历史继承保持一致——必须同时满足：
 *  - 没点名库内线路：否则「青城山前山步道」里的「山」会被当成库外实体，
 *    用户点名线路反而进不了聚焦模式；
 *  - 没给出库内地域词：给了城市（如「青岛」）属于地域检索，交给地域逻辑。
 */
function findOutOfLibraryEntityInQuery(
  query: string,
  aliasIndex: RouteAlias[],
  geoSet: Set<string>,
): string | null {
  if (findNamedRoute(query, aliasIndex, geoSet)) return null;
  if (queryHasGeoToken(query, geoSet)) return null;
  return scanOutOfLibraryEntity(query, aliasIndex, geoSet);
}

/**
 * 从上一轮 user 发言继承「库外实体」话题（追问场景的指代继承）。
 *
 * 三个收敛条件，缺一不可——这条路径最容易把话题污染到后面的轮次：
 *  1. 本轮必须是【延续】（intent.continuation）：像「什么线路适合带一家老小?」
 *     这种全新问题，即使上一轮聊过库外山体，也必须当新话题处理。
 *     过去这里只看「有没有地域词」，于是新问题被判成延续、被上一轮实体劫持（截图 bug）。
 *  2. 只回溯【最近一次 user 轮】，不再全量扫描 history：话题是有时效的，
 *     上一轮已经换过话题，就不该把更早的实体再捞回来。
 *  3. 本轮给了库内地域词 → 属于地域检索，不继承（否则「那青岛吧」被上一轮实体抢答）。
 */
function findOutOfLibraryEntityFromHistory(
  query: string,
  history: ChatTurn[] | undefined,
  aliasIndex: RouteAlias[],
  geoSet: Set<string>,
  intent: TurnIntent,
): string | null {
  if (!intent.continuation) return null;
  if (queryHasGeoToken(query, geoSet)) return null;
  const lastUserTurn = [...(history ?? [])].reverse().find((turn) => turn.role === "user");
  if (!lastUserTurn) return null;
  return scanOutOfLibraryEntity(lastUserTurn.content, aliasIndex, geoSet);
}

function coverageText(routes: RouteMeta[]): string {
  return [...new Set(routes.map((r) => r.city_name).filter(Boolean))].sort().join("、");
}

/** 兜底文案的构造上下文（带上 query 与判定信号，便于写埋点） */
type StaticCtx = { routes: RouteMeta[]; query: string; signals: string[] };

function makeStaticAnswer(answer: string, reason: FallbackReason, ctx: StaticCtx): ChatAnswer {
  // 兜底也写埋点：此前这些分支完全不落 trace，导致「trace 完整率」指标
  // 把每一轮静默降级都漏掉了，事后无法回答「用户到底被兜底了多少次、为什么」。
  appendTrace({
    trace_id: `chat_${Date.now()}`,
    route_id: "(fallback)",
    环节: "兜底",
    模式: "static",
    输入摘要: ctx.query.slice(0, 120),
    输出摘要: `${reason}: ${answer.slice(0, 120)}`,
    耗时: 0,
    token消耗: 0,
    成功: true,
    失败原因: "",
    意图信号: ctx.signals.join(","),
  });
  return {
    answer,
    sources: [],
    focus_route_id: null,
    mode: "recommend",
    fallback_reason: reason,
    metrics: { retrieve_ms: 0, answer_ms: 0, prompt_tokens: 0, completion_tokens: 0, topK: 0 },
  };
}

function buildClarifyAnswer(ctx: StaticCtx): ChatAnswer {
  const cov = coverageText(ctx.routes);
  return makeStaticAnswer(
    `你想在哪个城市或省份徒步呢？目前我掌握的资料覆盖 ${cov} 等城市的新手徒步线；告诉我目的地（例如「北京」「杭州」或「上海周边省份」），我就能帮你从库内挑合适的线路。注：我不掌握实时天气，确定城市后会按线路的适宜季节来推荐。`,
    "clarify_missing_city",
    ctx,
  );
}

function buildOutOfCityAnswer(city: string, ctx: StaticCtx): ChatAnswer {
  const cov = coverageText(ctx.routes);
  return makeStaticAnswer(
    `库内目前没有收录${city}的线路，因此无法基于资料为你推荐${city}的徒步线。我掌握的资料覆盖 ${cov} 等城市，如果你想换这些城市，我可以帮你挑合适的线路。`,
    "out_of_city",
    ctx,
  );
}

function buildOutOfLibraryAnswer(entity: string, ctx: StaticCtx): ChatAnswer {
  const cov = coverageText(ctx.routes);
  return makeStaticAnswer(
    `库内暂未收录「${entity}」这条线路，因此无法基于资料判断它对新手是否友好，也不会用网上的通用说法来评价它。我掌握的资料覆盖 ${cov} 等城市的新手徒步线；告诉我你想去的城市，我可以从库内帮你挑合适的线路。`,
    "out_of_library",
    ctx,
  );
}

function buildRegionEmptyAnswer(ctx: StaticCtx): ChatAnswer {
  const cov = coverageText(ctx.routes);
  return makeStaticAnswer(
    `库内暂时没有检索到你所指范围内的线路。我掌握的资料覆盖 ${cov} 等城市，可以换个城市或放宽范围再试试。`,
    "region_empty",
    ctx,
  );
}

// --------------------------------------------------------------------------- //
// LLM 调用
// --------------------------------------------------------------------------- //

const RECOMMEND_SYSTEM_PROMPT = `你是「新手友好徒步线路推荐」助手，服务于零基础徒步爱好者。
你的知识【只来自】本轮用户消息里提供的「候选线路」列表（来自知识库检索结果）。

必须只输出一个 JSON 对象（不要输出 markdown 代码块）：
{
  "answer": "面向用户的中文回答",
  "recommended_indexes": [1, 3]
}

严格要求：
1. 只能推荐候选列表里的线路，严禁编造列表之外的线路、参数或数据。
2. recommended_indexes 填候选线路的序号（候选线路 #n 的 n），按推荐优先级排序，最多 3 个；只放你真正推荐的序号。
3. answer 里用线路名称表述，【不要出现任何形如 rt_xxx 的内部编号】。
4. answer 从推荐的序号出发，逐条说明理由并写出线路名称；若列表中没有合适的，recommended_indexes 返回空数组，并在 answer 里如实说明、建议换关键词。
5. answer 面向零基础新手，语气亲切、易懂，使用简体中文，控制在 220 字以内。
6. 回答中对每条线路的描述（难度、里程、景观、景点、视野、植被、设施等）都必须直接来自上面「候选线路」给出的线路资料与溯源依据，不得自行添加资料里没有的定性特征（如「看海/观海」「瀑布」「红叶」「视野开阔」「花木植被」）或资料未出现的景点/地标/节点名称。
7. 不要做资料未支持的跨线路绝对化比较（如「最/极/经典/必去」），除非资料明确写了；资料未覆盖的信息（实时天气、门票、具体补给点等）不要编造。
8. 若「候选线路」为空或标注「库内未检索到该范围线路」，如实说明库内暂无匹配，不要推荐列表外的线路；回答中引用候选请用线路名称，不要使用 #编号。`;

const FOCUS_SYSTEM_PROMPT = `你是「新手友好徒步线路」助手。本轮用户正在追问【同一条线路】，请只针对这一条线路回答。

必须只输出一个 JSON 对象（不要输出 markdown 代码块）：
{ "answer": "面向用户的中文回答" }

严格要求：
1. 只回答这一条线路，【不要推荐、也不要提及其他任何线路】，不要出现「推荐 / 这几条 / 优先选」之类的推荐话术。
2. 只用本轮提供的线路资料回答。严禁编造资料中没有的信息，包括：具体数值/参数（开放时间、票价、停车费、联系电话、补给点/指示牌位置）；资料未写的定性特征与景观（如「看海/观海」「瀑布」「红叶」「视野开阔」「花木植被」）；资料未出现的景点/地标/节点名称；资料未支持的「最/极/经典/必去」等绝对化表述。
3. 若消息末尾附有【实时数据】块：其中是高德开放平台的实时天气/预报，可信可用；问天气时优先引用并注明「根据实时数据」。【实时数据】未覆盖的问题（如实时人流/拥挤度、门票价格）仍按第 4 条如实说明，不得编造。
4. 若用户问到资料与实时数据均未覆盖的内容，直接回答「资料未覆盖，建议出发前确认」，不要给任何具体数值、时间段或自行补充的景观描述。
5. 面向零基础新手，语气亲切、易懂，使用简体中文，控制在 220 字以内。`;

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

function buildHistoryMessages(history: ChatTurn[] | undefined, limit = 6): Array<{ role: string; content: string }> {
  if (!history || history.length === 0) return [];
  return history.slice(-limit).map((turn) => ({
    role: turn.role,
    // 助手历史回答较长，截断以免干扰本轮上下文
    content: turn.content.slice(0, 200),
  }));
}

async function callChatLLM(
  systemPrompt: string,
  userMessage: string,
  history: ChatTurn[] | undefined,
): Promise<{ content: string; usage: ChatCompletionResponse["usage"] }> {
  if (!CHAT_API_KEY) {
    throw new RouteChatServiceError("AGENT_PREFILL_API_KEY 未配置，无法调用对话模型");
  }

  const response = await fetch(CHAT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CHAT_API_KEY}`,
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        ...buildHistoryMessages(history),
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new RouteChatServiceError(`对话模型请求失败 ${response.status}: ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) {
    throw new RouteChatServiceError("对话模型返回内容为空");
  }
  return { content, usage: payload.usage };
}

function parseAnswer(content: string): string {
  try {
    const parsed = JSON.parse(content) as { answer?: unknown };
    if (typeof parsed.answer === "string" && parsed.answer.trim()) {
      return parsed.answer.trim();
    }
  } catch {
    // 解析失败则整段当回答
  }
  return content;
}

/** 解析推荐候选序号（1-based），非法值/越界由调用方结合候选数过滤 */
function parseRecommendedIndexes(content: string): number[] {
  try {
    const parsed = JSON.parse(content) as { recommended_indexes?: unknown };
    if (Array.isArray(parsed.recommended_indexes)) {
      return parsed.recommended_indexes
        .filter((value): value is number => typeof value === "number" && Number.isInteger(value))
        .filter((value) => value >= 1);
    }
  } catch {
    // ignore
  }
  return [];
}

// --------------------------------------------------------------------------- //
// 上下文构造
// --------------------------------------------------------------------------- //

function routeFacts(card: RouteCard | undefined): string {
  return [
    card?.route_name,
    card?.province_name && card?.city_name ? `${card.province_name}${card.city_name}` : card?.city_name,
    card?.route_type_label,
    card?.difficulty_label,
    card?.distance_km != null ? `约${card.distance_km}km` : null,
    card?.duration_hours != null ? `约${card.duration_hours}小时` : null,
    card?.ascent_m != null ? `爬升约${card.ascent_m}m` : null,
    card?.surface_tags?.length ? `路面：${card.surface_tags.join("、")}` : null,
    card?.season_tags?.length ? `适宜季节：${card.season_tags.join("、")}` : null,
    card?.summary_short ? `简介：${card.summary_short}` : null,
    card?.start_point_name ? `起点：${card.start_point_name}` : null,
    card?.end_point_name ? `终点：${card.end_point_name}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

/**
 * 推荐模式上下文：候选用 1-based 序号标识，不带内部 route_id
 * （避免模型把 rt_xxx 抄进答案；序号→route_id 的映射在服务端完成）
 */
function buildRecommendContext(results: RetrievalResult[]): string {
  if (results.length === 0) return "（无候选线路）";
  return results
    .map((r, i) =>
      [
        `候选线路 #${i + 1}：${routeFacts(r.route_card)}`,
        `  溯源依据（${CHUNK_TYPE_LABEL[r.matched_chunk_type] ?? r.matched_chunk_type}）：${r.matched_text}`,
      ].join("\n"),
    )
    .join("\n\n");
}

/** 聚焦模式上下文：单条线路的全部 chunk（同样不外露 route_id） */
function buildFocusContext(card: RouteCard, chunks: Array<{ chunk_type: string; text: string }>): string {
  const body = chunks
    .map((chunk) => `【${CHUNK_TYPE_LABEL[chunk.chunk_type] ?? chunk.chunk_type}】${chunk.text}`)
    .join("\n");
  return `当前线路：${routeFacts(card)}\n\n线路资料：\n${body}`;
}

// --------------------------------------------------------------------------- //
// 埋点
// --------------------------------------------------------------------------- //

function tracePath(): string {
  return path.join(process.cwd(), "data", "rag", "chat-trace.jsonl");
}

function appendTrace(entry: Record<string, unknown>): void {
  try {
    fs.mkdirSync(path.dirname(tracePath()), { recursive: true });
    fs.appendFileSync(tracePath(), JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // 埋点失败不应影响主流程
  }
}

// --------------------------------------------------------------------------- //
// 主入口
// --------------------------------------------------------------------------- //

function toSource(result: RetrievalResult, recommended: boolean): ChatSource {
  return {
    route_id: result.route_id,
    route_name: result.route_name,
    city_name: result.city_name,
    score: result.score,
    recommended,
    matched_chunk_type: result.matched_chunk_type,
    matched_chunk_label: CHUNK_TYPE_LABEL[result.matched_chunk_type] ?? result.matched_chunk_type,
    matched_text: result.matched_text,
    route_card: result.route_card,
  };
}

/**
 * 按 LLM 返回的候选序号重排 sources：推荐项在前（保持模型给出的优先级），
 * 其余按检索分随后。序号越界会被忽略，避免模型乱填导致错位。
 */
function orderSources(results: RetrievalResult[], recommendedIndexes: number[]): ChatSource[] {
  const ordered: ChatSource[] = [];
  const usedIds = new Set<string>();
  for (const index of recommendedIndexes) {
    const hit = results[index - 1];
    if (hit && !usedIds.has(hit.route_id)) {
      ordered.push(toSource(hit, true));
      usedIds.add(hit.route_id);
    }
  }
  for (const r of results) {
    if (!usedIds.has(r.route_id)) ordered.push(toSource(r, false));
  }
  return ordered;
}

async function answerInFocusMode(
  query: string,
  focusRouteId: string,
  history: ChatTurn[] | undefined,
): Promise<ChatAnswer> {
  const retriever = getRouteRetriever();

  const tRetrieve = Date.now();
  const hit = await retriever.retrieveForRoute(query, focusRouteId);
  const chunks = hit ? await retriever.getRouteChunks(focusRouteId) : null;
  const retrieveMs = Date.now() - tRetrieve;

  if (!hit || !chunks || !hit.route_card) {
    throw new RouteChatServiceError(`聚焦线路不存在：${focusRouteId}`);
  }

  appendTrace({
    trace_id: `chat_${Date.now()}`,
    route_id: focusRouteId,
    环节: "检索",
    模式: "focus",
    输入摘要: query.slice(0, 120),
    输出摘要: `聚焦 ${hit.route_name}`,
    耗时: retrieveMs,
    token消耗: 0,
    成功: true,
    失败原因: "",
  });

  const context = buildFocusContext(hit.route_card, chunks);
  // 实时数据（天气等）按需注入：只有用户问到时才拉高德接口，命中与否都走同一防线
  const live = await buildLiveContext(query, hit.route_card);
  const tAnswer = Date.now();
  const { content, usage } = await callChatLLM(
    FOCUS_SYSTEM_PROMPT,
    `用户追问（当前线路：${hit.route_name}）：${query}\n\n${context}${live ? `\n\n${live}` : ""}`,
    history,
  );
  const answerMs = Date.now() - tAnswer;
  const answer = parseAnswer(content);

  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;

  appendTrace({
    trace_id: `chat_${Date.now()}`,
    route_id: focusRouteId,
    环节: "回答生成",
    模式: "focus",
    输入摘要: `query=${query.slice(0, 80)} | 聚焦=${hit.route_name}`,
    输出摘要: answer.slice(0, 160),
    耗时: answerMs,
    token消耗: promptTokens + completionTokens,
    成功: true,
    失败原因: "",
  });

  return {
    answer,
    sources: [toSource(hit, true)],
    focus_route_id: focusRouteId,
    mode: "focus",
    fallback_reason: null,
    metrics: {
      retrieve_ms: retrieveMs,
      answer_ms: answerMs,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      topK: 1,
    },
  };
}

async function answerInRecommendMode(
  query: string,
  topK: number,
  history: ChatTurn[] | undefined,
  allowedProvinces: string[] | null,
  signals: string[],
): Promise<ChatAnswer> {
  const retriever = getRouteRetriever();

  const tRetrieve = Date.now();
  // 地域过滤会丢弃省外候选，故先取更大候选池再过滤：避免「那青岛吧」这类弱语义 query
  // 因 topK 内恰好没有目标省份线路，而被误判成「该范围内无线路」。
  const hasRegion = Boolean(allowedProvinces && allowedProvinces.length > 0);
  let results = await retriever.retrieve(query, hasRegion ? Math.max(topK * 4, 20) : topK);
  // 地域约束：仅保留目标省份内的候选
  if (hasRegion) {
    results = results
      .filter((r) => allowedProvinces!.includes(r.route_card?.province_name ?? ""))
      .slice(0, topK);
  }
  const retrieveMs = Date.now() - tRetrieve;

  // 地域范围内无候选（如某城市周边省份在库内无线路）→ 如实说明，不硬推
  if (allowedProvinces && allowedProvinces.length > 0 && results.length === 0) {
    return buildRegionEmptyAnswer({ routes: await retriever.listRoutes(), query, signals });
  }

  appendTrace({
    trace_id: `chat_${Date.now()}`,
    route_id: results.map((r) => r.route_id).join(",") || "(none)",
    环节: "检索",
    模式: "recommend",
    输入摘要: query.slice(0, 120),
    输出摘要: `top${results.length}: ${results.map((r) => r.route_name).join(" / ") || "无"}`,
    耗时: retrieveMs,
    token消耗: 0,
    成功: results.length > 0,
    失败原因: results.length > 0 ? "" : "未命中任何线路",
  });

  const context = buildRecommendContext(results);
  const tAnswer = Date.now();
  const { content, usage } = await callChatLLM(
    RECOMMEND_SYSTEM_PROMPT,
    `用户需求：${query}\n\n候选线路（按检索相关度排序，来自知识库）：\n${context}`,
    history,
  );
  const answerMs = Date.now() - tAnswer;

  const answer = parseAnswer(content);
  const recommendedIndexes = parseRecommendedIndexes(content);
  const sources = orderSources(results, recommendedIndexes);
  const recommendedNames = sources.filter((s) => s.recommended).map((s) => s.route_name);

  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;

  appendTrace({
    trace_id: `chat_${Date.now()}`,
    route_id: results.map((r) => r.route_id).join(",") || "(none)",
    环节: "回答生成",
    模式: "recommend",
    输入摘要: `query=${query.slice(0, 80)} | 候选=${results.length}条`,
    输出摘要: `推荐[${recommendedNames.join(" / ") || "无"}] ${answer.slice(0, 120)}`,
    耗时: answerMs,
    token消耗: promptTokens + completionTokens,
    成功: true,
    失败原因: "",
  });

  return {
    answer,
    sources,
    focus_route_id: null,
    mode: "recommend",
    fallback_reason: null,
    metrics: {
      retrieve_ms: retrieveMs,
      answer_ms: answerMs,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      topK: results.length,
    },
  };
}

export async function answerRouteQuery(
  query: string,
  options: AnswerRouteQueryOptions = {},
): Promise<ChatAnswer> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new RouteChatServiceError("query 不能为空");
  }
  if (!isRouteRagConfigured()) {
    throw new RouteChatServiceError("RAG 检索未就绪：请先配置 AGENT_PREFILL_API_KEY 并构建 data/rag/route-index.json");
  }

  const topK = Math.min(Math.max(options.topK ?? 5, 1), 10);
  const retriever = getRouteRetriever();
  const routes = await retriever.listRoutes();
  const geoSet = buildGeoTokenSet(routes);
  const aliasIndex = buildAliasIndex(routes);

  // 本轮意图只解析一次，下游所有分支都读这份结论（不再各自扫一遍 query 再互相否决）
  const intent = resolveTurnIntent(trimmed);
  const staticCtx: StaticCtx = { routes, query: trimmed, signals: intent.signals };

  // 聚焦判定【之前】先处理「本轮新点名的库外实体」：用户点名词典外的山体（如「四姑娘山」）时，
  // 即使上一轮有聚焦线路，也必须解除聚焦、如实说明库内未收录；否则会继承旧聚焦，
  // 把新实体硬塞进旧线路语境，答成「XX 不在当前线路资料范围内」（截图 bug）。
  const outOfLibraryNow = findOutOfLibraryEntityInQuery(trimmed, aliasIndex, geoSet);
  if (outOfLibraryNow) {
    return buildOutOfLibraryAnswer(outOfLibraryNow, staticCtx);
  }

  // 聚焦来源优先级：客户端显式携带 > 服务端从 history 回溯
  const carriedFocusId =
    options.focusRouteId ?? deriveFocusFromHistory(options.history, aliasIndex, geoSet) ?? undefined;
  const focusRouteId = resolveFocusRouteId(trimmed, aliasIndex, geoSet, carriedFocusId, intent);
  if (focusRouteId) {
    return answerInFocusMode(trimmed, focusRouteId, options.history);
  }

  // 本轮未点名、但在【延续上一轮话题】时，继承上文点过的库外实体（纯追问）
  const oolEntity = findOutOfLibraryEntityFromHistory(
    trimmed,
    options.history,
    aliasIndex,
    geoSet,
    intent,
  );
  if (oolEntity) {
    return buildOutOfLibraryAnswer(oolEntity, staticCtx);
  }

  // 地域约束 / 澄清 / 库外城市
  const libGeoMap = buildLibGeoMap(routes);
  const geo = resolveGeoScope(trimmed, geoSet, libGeoMap);
  if (geo.kind === "clarify") return buildClarifyAnswer(staticCtx);
  if (geo.kind === "out_city") return buildOutOfCityAnswer(geo.city, staticCtx);
  if (geo.kind === "region") {
    return answerInRecommendMode(trimmed, topK, options.history, geo.provinces, intent.signals);
  }
  return answerInRecommendMode(trimmed, topK, options.history, null, intent.signals);
}
