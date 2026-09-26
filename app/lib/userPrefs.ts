"use client";

/**
 * 轻量用户偏好采集：把对话里的高频偏好词沉淀到 localStorage，
 * 供首页「快速开始」与对话页 suggestion 复用（纯前端，无后端依赖）。
 */

const KEY = "hr_user_queries";

// 徒步场景偏好词表（命中即视为一条有效偏好信号）
const PREF_VOCAB = [
  "看海", "海景", "观海", "临海", "红叶", "赏枫", "枫叶", "秋色",
  "亲子", "带娃", "避暑", "清凉", "风景", "出片", "拍照",
  "轻松", "低强度", "强度低", "最轻松", "成熟", "回撤", "安全", "最安全",
  "新手", "古寺", "人文", "寺庙", "道观", "瀑布", "观景", "视野",
  "城市", "环线", "古道", "森林", "湖", "露营", "日出", "看日出",
  "云海", "野趣", "溯溪", "溪谷", "桃花", "樱花", "银杏", "看日出",
];

export function recordUserQuery(text: string) {
  if (typeof window === "undefined" || !text?.trim()) return;
  try {
    const arr = getStoredQueries();
    arr.push(text.trim());
    while (arr.length > 60) arr.shift();
    localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {
    /* 忽略存储异常（隐私模式等） */
  }
}

export function getStoredQueries(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** 从用户历史对话里抽取出现频次最高的偏好词（最多 limit 个） */
export function getTopKeywords(limit = 3): string[] {
  const queries = getStoredQueries();
  if (queries.length === 0) return [];
  const counter: Record<string, number> = {};
  for (const q of queries) {
    for (const kw of PREF_VOCAB) {
      if (q.includes(kw)) counter[kw] = (counter[kw] ?? 0) + 1;
    }
  }
  return Object.entries(counter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([kw]) => kw);
}
