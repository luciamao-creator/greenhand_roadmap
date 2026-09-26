/**
 * route-chat-routing.ts —— 纯路由逻辑（无副作用）
 *
 * 从 route-chat-service.ts 抽离出来的「本轮意图 / 库外实体识别」判定。
 * 故意只 import type、不 import 任何有运行时副作用的模块（retriever / embedding / fs / LLM），
 * 因此可用 `node --experimental-strip-types scripts/test-chat-routing.ts` 做毫秒级表驱动单测，
 * 把「补丁驱动」「无单测」的土壤清掉（决策文档 §6.2 / §6.3）。
 *
 * 全服务只有 resolveTurnIntent 一个地方判「本轮是延续还是新检索」。
 */

import type { RouteMeta } from "./route-vector-retriever";

// ────────────────────────────────────────────────────────────────────────────
// 本轮意图解析（全服务唯一判定点）
// ────────────────────────────────────────────────────────────────────────────
export type TurnIntent = {
  /** 本轮延续上一轮话题（回指 / 缺省主语的追问） */
  continuation: boolean;
  /** 本轮是一次新的检索请求（要一组新的线路） */
  newRequest: boolean;
  /**
   * newRequest 仅由弱疑问词触发（无「推荐/换线」等强信号）。
   * 这类 query（如「有什么亮点」）在【已显式聚焦】时更可能是对聚焦线路的属性追问，
   * 调用方据此决定是否保留聚焦，避免仅凭「什么」二字就把聚焦打散。
   */
  weakNewOnly: boolean;
  /** 命中的信号词：写进埋点，出问题时能直接看出是哪条规则做的决定 */
  signals: string[];
};

/** 「要一组新线路」的强信号：明确要新推荐 / 换线 → 必须解除聚焦 */
export const STRONG_NEW_REQUEST_TOKENS = [
  "推荐", "有没有", "有哪些", "帮我找", "找个", "找条", "想去", "适合", "还有什么", "看看",
  // 「换线」类：明确要求换一条（决策文档 §3.3 / §4.1：明确要新推荐 → 必须解除聚焦）
  "换一", "换条", "换个", "另一条", "另外一条", "别的", "其他", "再来一条",
];

/** 弱疑问词：形态像开新话题，但已聚焦时更可能是对聚焦线的追问（「有什么亮点」） */
export const WEAK_NEW_REQUEST_TOKENS = [
  "什么", "哪些", "哪", "介绍", "怎么选",
];

/** 「要一组新线路」的全部信号词（强 + 弱，兼容旧引用） */
export const NEW_REQUEST_TOKENS = [...STRONG_NEW_REQUEST_TOKENS, ...WEAK_NEW_REQUEST_TOKENS];

/** 「还在说上一轮那个话题」的信号词（回指词 + 属性追问词） */
export const CONTINUATION_TOKENS = [
  // 回指
  "这条", "那条", "该线", "此线", "它", "上面", "刚才", "前面", "呢", "还有",
  // 属性追问（问的是同一条线的属性）
  "相比", "格外", "注意", "准备", "难度", "多远", "多久", "多长", "累", "安全",
  "下撤", "装备", "补水", "带什么", "怎么走", "几点", "爬升", "补给", "路况", "入口",
];

/** 「为什么/为何」问的是原因 = 对上一轮的追问，其中的「什么」不算开新话题 */
export const WHY_RE = /为什么|为何|咋回事/;

/**
 * 判定本轮意图。
 *
 * 单边命中 → 按该边；两边都命中（如「相比其他路线要注意什么」）或都没命中
 * （如「为什么难」）→ 默认【延续】：缺省主语的追问在多轮对话里远比新检索常见。
 * 真正的开新话题通常还会带地域词或实体名，由调用方先行拦下。
 */
export function resolveTurnIntent(query: string): TurnIntent {
  const forNewTopic = query.replace(WHY_RE, "");
  const strongSignals = STRONG_NEW_REQUEST_TOKENS.filter((token) => forNewTopic.includes(token));
  const weakSignals = WEAK_NEW_REQUEST_TOKENS.filter((token) => forNewTopic.includes(token));
  const contSignals = CONTINUATION_TOKENS.filter((token) => query.includes(token));
  const signals = [...strongSignals, ...weakSignals, ...contSignals];
  if (strongSignals.length > 0 && contSignals.length === 0) {
    return { continuation: false, newRequest: true, weakNewOnly: false, signals };
  }
  if (weakSignals.length > 0 && strongSignals.length === 0 && contSignals.length === 0) {
    // 仅弱疑问词：默认仍按新检索口径（延续旧行为），weakNewOnly 供「已聚焦」场景放行追问
    return { continuation: false, newRequest: true, weakNewOnly: true, signals };
  }
  if (contSignals.length > 0 && strongSignals.length === 0 && weakSignals.length === 0) {
    return { continuation: true, newRequest: false, weakNewOnly: false, signals };
  }
  return { continuation: true, newRequest: false, weakNewOnly: false, signals };
}

// ────────────────────────────────────────────────────────────────────────────
// 库外实体识别（候选提取 + 边界字 + 泛化词黑名单，均表驱动，便于负例锁定边界）
// ────────────────────────────────────────────────────────────────────────────
export type RouteAlias = { alias: string; route: RouteMeta };

/** 实体名不得包含的功能/季节/量词等边界字（含则不是「具体山体/线路名」） */
export const ENTITY_BOUNDARY_CHARS =
  "的了我有点看去能周海要合手附带你找推鉴问知秋夏春冬了在和与被把让给叫这那哪什怎为对跟向从到比更最太还都就只才也又再很些个条们她他你适新路";
export const ENTITY_BOUNDARY_SET = new Set(ENTITY_BOUNDARY_CHARS.split(""));

/** 山体/线路名后缀（用于定位候选实体的结尾） */
export const ENTITY_SUFFIX_LIST = [
  "登山步道", "登山古道", "郊野公园", "郊野径", "健康步道", "健身步道", "轻徒步线",
  "登山道", "步道", "古道", "绿道", "北线", "南线", "线", "山", "峰", "岭", "径",
];
export const ENTITY_SUFFIX_RE = new RegExp(`(${ENTITY_SUFFIX_LIST.join("|")})`, "g");
const HAN_RE = /[一-龥]/;

/**
 * 从后缀结尾向前回溯拼接核心名：只取紧邻的汉字且非边界字，遇到边界字/非汉字即止。
 * 这样「新手适合四姑娘山」会在「合」处断开，正确得到「四姑娘」，而非吞掉整段。
 */
function extractNameBefore(text: string, suffixStart: number): string {
  let name = "";
  let i = suffixStart - 1;
  while (name.length < 6 && i >= 0) {
    const ch = text[i];
    if (!HAN_RE.test(ch)) break;
    if (ENTITY_BOUNDARY_SET.has(ch)) break;
    name = ch + name;
    i -= 1;
  }
  return name;
}

/**
 * 泛化词黑名单：形态像「XX山/XX线」但并非具体线路名的词。
 * 例如「短途线路」的「短途」、「新手路线」的「新手」，不得当成库外实体。
 */
export const ENTITY_STOPWORDS = new Set([
  "短途", "长途", "新手", "户外", "经典", "热门", "轻松", "亲子",
  "附近", "周边", "周围", "周末", "一天", "半天", "全程", "沿途",
  "地方", "城市", "省份", "地区", "路线", "线路", "景观", "视野",
  "海拔", "里程", "装备", "天气", "季节",
]);

/** 直辖市 + 省份 + 主要城市（库外城市/省份识别用；库内城市会被 libGeoSet 排除） */
export const PROVINCE_NAMES = [
  "北京", "天津", "上海", "重庆", "河北", "山西", "辽宁", "吉林", "黑龙江", "江苏",
  "浙江", "安徽", "福建", "江西", "山东", "河南", "湖北", "湖南", "广东", "海南",
  "四川", "贵州", "云南", "陕西", "甘肃", "青海", "台湾", "内蒙古", "广西", "西藏",
  "宁夏", "新疆", "香港", "澳门",
];
export const MAJOR_CITIES = [
  "拉萨", "哈尔滨", "昆明", "贵阳", "南宁", "郑州", "济南", "太原", "沈阳", "长春",
  "南昌", "海口", "乌鲁木齐", "兰州", "西宁", "银川", "呼和浩特", "桂林", "丽江",
  "黄山", "天津", "石家庄", "青岛", "大连", "烟台", "无锡", "常州", "南通", "徐州",
  "温州", "金华", "嘉兴", "湖州", "台州", "佛山", "东莞", "中山", "惠州", "三亚",
  "保定", "唐山", "邯郸", "泉州", "漳州", "赣州", "株洲", "湘潭", "岳阳", "常德",
  "绵阳", "宜宾", "遵义", "大理", "张家界", "泰安", "洛阳", "开封", "大同",
];
export const LIB_GEO_UNKNOWN = [...PROVINCE_NAMES, ...MAJOR_CITIES];

/** 在单条文本里扫描「点名但库外」的线路/山体名（核心名 >=2 字，非库内、非地域词） */
export function scanOutOfLibraryEntity(
  text: string,
  aliasIndex: RouteAlias[],
  geoSet: Set<string>,
): string | null {
  ENTITY_SUFFIX_RE.lastIndex = 0;
  let mm: RegExpExecArray | null;
  while ((mm = ENTITY_SUFFIX_RE.exec(text)) !== null) {
    const suffix = mm[0];
    // 「线路 / 路线」里的「线」是通用名词，不是线路名后缀（否则会把「短途」当实体）
    if (suffix === "线" && text[mm.index + suffix.length] === "路") continue;
    const name = extractNameBefore(text, mm.index);
    if (name.length < 2) continue;
    if (ENTITY_STOPWORDS.has(name)) continue;
    if (geoSet.has(name)) continue;
    const inLib = aliasIndex.some((a) => a.alias === name || a.alias.startsWith(name));
    if (inLib) continue;
    if (LIB_GEO_UNKNOWN.includes(name)) continue;
    return name;
  }
  return null;
}
