"use client";

import { useEffect, useRef, useState } from "react";
import { getTopKeywords, recordUserQuery } from "../lib/userPrefs";

type RouteCard = {
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
};

type ChatSource = {
  route_id: string;
  route_name: string;
  city_name: string;
  score: number;
  recommended: boolean;
  matched_chunk_type: string;
  matched_chunk_label: string;
  matched_text: string;
  route_card: RouteCard | undefined;
};

type ChatMetrics = {
  retrieve_ms: number;
  answer_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  topK: number;
};

type ChatData = {
  answer: string;
  sources: ChatSource[];
  focus_route_id: string | null;
  mode: "recommend" | "focus";
  fallback_reason?: string | null;
  metrics: ChatMetrics;
};

type Message = {
  role: "user" | "assistant";
  text: string;
  sources?: ChatSource[];
  metrics?: ChatMetrics;
  mode?: "recommend" | "focus";
  fallbackReason?: string | null;
  error?: boolean;
};

type ChecklistItem = {
  dimension: string;
  label: string;
  mentioned: boolean;
  quotes: string[];
};

// 对话状态持久化到 sessionStorage：切 tab（组件卸载）或页面被浏览器回收重载后可恢复。
// 用 sessionStorage 而非 localStorage：关掉浏览器后对话作废是合理预期，也避免跨会话残留旧上下文。
const CHAT_MESSAGES_KEY = "chat_messages_v1";
const CHAT_CHECKLISTS_KEY = "chat_checklists_v1";
const CHAT_OPEN_CHECKLIST_KEY = "chat_open_checklist_v1";

function readSessionJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeSessionJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储满 / 隐私模式：静默降级为不持久化
  }
}

const EXAMPLES = [
  "深圳新手友好、能看海的短途线",
  "北京秋天看红叶的古道",
  "带娃轻松的亲子徒步，别太累",
  "成都周边避暑的环线",
];

const FALLBACK_LABELS: Record<string, string> = {
  clarify_missing_city: "需先确定城市",
  out_of_city: "该城市库内无线路",
  out_of_library: "库内未收录该线路",
  region_empty: "该范围内无线路",
};

function formatMetric(value: number | null | undefined, unit: string) {
  return typeof value === "number" && Number.isFinite(value) ? `${value}${unit}` : "待补";
}

export default function ChatPanel({
  focusRouteId,
  focusName,
  onFocusChange,
  onViewMap,
}: {
  focusRouteId: string | null;
  focusName: string | null;
  onFocusChange: (id: string | null, name: string | null) => void;
  onViewMap: (routeId: string, routeName: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>(() =>
    readSessionJson<Message[]>(CHAT_MESSAGES_KEY, []),
  );
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [checklists, setChecklists] = useState<Record<string, ChecklistItem[]>>(() =>
    readSessionJson<Record<string, ChecklistItem[]>>(CHAT_CHECKLISTS_KEY, {}),
  );
  const [openChecklistId, setOpenChecklistId] = useState<string | null>(() =>
    readSessionJson<string | null>(CHAT_OPEN_CHECKLIST_KEY, null),
  );

  // 恢复会话：切 tab / 页面重载后接着上次的对话继续
  useEffect(() => {
    writeSessionJson(CHAT_MESSAGES_KEY, messages);
  }, [messages]);
  useEffect(() => {
    writeSessionJson(CHAT_CHECKLISTS_KEY, checklists);
  }, [checklists]);
  useEffect(() => {
    writeSessionJson(CHAT_OPEN_CHECKLIST_KEY, openChecklistId);
  }, [openChecklistId]);
  // 恢复了「展开的清单」但数据尚未缓存时，补一次拉取
  useEffect(() => {
    if (openChecklistId) void loadChecklist(openChecklistId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openChecklistId]);

  const loadChecklist = async (routeId: string) => {
    if (checklists[routeId]) return;
    try {
      const res = await fetch(`/api/route-checklist?routeId=${encodeURIComponent(routeId)}`);
      const payload = await res.json().catch(() => null);
      if (payload && payload.code === "OK" && Array.isArray(payload.data?.items)) {
        setChecklists((prev) => ({ ...prev, [routeId]: payload.data.items as ChecklistItem[] }));
      }
    } catch {
      // 静默失败：清单是增强功能，不影响对话主流程
    }
  };

  const toggleChecklist = (routeId: string) => {
    setOpenChecklistId((prev) => {
      const next = prev === routeId ? null : routeId;
      if (next === routeId) void loadChecklist(routeId);
      return next;
    });
  };

  const send = async (text: string) => {
    const query = text.trim();
    if (!query || sending) return;
    recordUserQuery(query);

    const history = messages.map((message) => ({ role: message.role, content: message.text }));

    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: query }]);
    setSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, topK: 5, focusRouteId, history }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "对话服务出错");
      }
      const data = payload.data as ChatData;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.answer,
          sources: data.sources,
          metrics: data.metrics,
          mode: data.mode,
          fallbackReason: data.fallback_reason ?? null,
        },
      ]);

      if (data.focus_route_id) {
        const named = data.sources.find((source) => source.route_id === data.focus_route_id);
        onFocusChange(data.focus_route_id, named?.route_name ?? data.focus_route_id);
      } else {
        onFocusChange(null, null);
      }
    } catch (cause) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: cause instanceof Error ? cause.message : "对话服务出错",
          error: true,
        },
      ]);
    } finally {
      setSending(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  };

  // 随历史动态更新的建议：有对话记录后用用户高频偏好词生成，否则用默认示例
  const suggestions = (() => {
    const kw = getTopKeywords(4);
    if (messages.length === 0) return EXAMPLES;
    const dyn = kw.map((k) => `推荐${k}的线`);
    return dyn.length ? dyn : EXAMPLES.slice(0, 3);
  })();

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="frost mt-2 rounded-2xl p-6 text-center text-sm text-muted">
            试试下面的示例，或直接描述你的需求：城市 + 难度 + 偏好（看海 / 红叶 / 亲子 / 避暑）。
          </div>
        ) : null}

        {messages.map((message, index) => (
          <div key={index} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={message.role === "user" ? "max-w-[80%]" : "w-full max-w-[92%]"}>
              <div
                className={
                  message.role === "user"
                    ? "rounded-2xl rounded-br-sm px-4 py-3 text-sm text-white"
                    : message.error
                      ? "rounded-2xl rounded-bl-sm px-4 py-3 text-sm"
                      : "frost-strong rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-ink"
                }
                style={
                  message.role === "user"
                    ? { background: "#173d2c" }
                    : message.error
                      ? { background: "var(--danger)", color: "#b91c1c", border: "1px solid rgba(185,28,28,0.18)" }
                      : undefined
                }
              >
                {message.text}
              </div>

              {message.role === "assistant" && message.sources && message.sources.length > 0 ? (
                <SourcesPanel
                  sources={message.sources}
                  mode={message.mode ?? "recommend"}
                  activeFocusId={focusRouteId}
                  onFocus={onFocusChange}
                  onViewMap={onViewMap}
                  checklists={checklists}
                  openChecklistId={openChecklistId}
                  onToggleChecklist={toggleChecklist}
                />
              ) : null}

              {message.metrics ? (
                <div className="mt-1 text-right text-[11px] text-muted">
                  {message.fallbackReason
                    ? FALLBACK_LABELS[message.fallbackReason] ?? message.fallbackReason
                    : message.mode === "focus"
                      ? "聚焦模式"
                      : "推荐模式"}
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {sending ? (
          <div className="flex justify-start">
            <div className="frost-strong rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-muted">检索线路中…</div>
          </div>
        ) : null}
      </div>

      <footer className="border-t border-white/70 bg-white/80 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl">
          {focusRouteId && focusName ? (
            <div className="mb-3 flex items-center gap-2 text-xs">
              <span className="text-muted">当前聚焦</span>
              <span className="chip chip-brand">
                {focusName}
                <button
                  type="button"
                  onClick={() => onFocusChange(null, null)}
                  className="ml-1 font-bold"
                  title="清除聚焦，回到全局推荐"
                >
                  ✕
                </button>
              </span>
              <span className="text-muted">· 追问将只针对这条线</span>
            </div>
          ) : null}

          {focusRouteId ? null : (
            <div className="mb-3 flex flex-wrap gap-2">
              {suggestions.map((example) => (
                <button
                  key={example}
                  type="button"
                  disabled={sending}
                  onClick={() => send(example)}
                  className="rounded-full bg-white/90 px-3 py-1.5 text-xs text-muted shadow-sm transition hover:bg-white"
                  style={{ border: "1px solid rgba(18,32,24,0.06)" }}
                >
                  {example}
                </button>
              ))}
            </div>
          )}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={sending}
              placeholder={
                focusRouteId && focusName
                  ? `继续追问「${focusName}」，例如：这条路要带什么 / 相比其他路线要注意什么`
                  : "例如：深圳新手友好、能看海的短途线"
              }
              className="flex-1 rounded-xl border bg-white px-4 py-2.5 text-sm text-ink outline-none"
              style={{ borderColor: "rgba(18,32,24,0.1)" }}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="btn-primary px-5 py-2.5 text-sm disabled:opacity-40"
            >
              发送
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
}

function SourcesPanel({
  sources,
  mode,
  activeFocusId,
  onFocus,
  onViewMap,
  checklists,
  openChecklistId,
  onToggleChecklist,
}: {
  sources: ChatSource[];
  mode: "recommend" | "focus";
  activeFocusId: string | null;
  onFocus: (id: string, name: string) => void;
  onViewMap: (routeId: string, routeName: string) => void;
  checklists: Record<string, ChecklistItem[]>;
  openChecklistId: string | null;
  onToggleChecklist: (routeId: string) => void;
}) {
  const recommended = sources.filter((source) => source.recommended);
  const others = sources.filter((source) => !source.recommended);
  const [showOthers, setShowOthers] = useState(false);

  if (mode === "focus") {
    return (
      <div className="mt-2 space-y-2">
        <div className="text-xs font-semibold text-muted">当前线路资料</div>
        {sources.map((source) => (
          <SourceCard
            key={source.route_id}
            source={source}
            isFocused
            onViewMap={onViewMap}
            checklists={checklists}
            openChecklistId={openChecklistId}
            onToggleChecklist={onToggleChecklist}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      {recommended.length > 0 ? (
        <>
          <div className="text-xs font-semibold text-muted">
            推荐依据（按推荐顺序）· {recommended.length} 条
          </div>
          {recommended.map((source) => (
            <SourceCard
              key={source.route_id}
              source={source}
              isFocused={source.route_id === activeFocusId}
              onFocus={() => onFocus(source.route_id, source.route_name)}
              onViewMap={onViewMap}
              checklists={checklists}
              openChecklistId={openChecklistId}
              onToggleChecklist={onToggleChecklist}
            />
          ))}
        </>
      ) : (
        <div className="text-xs text-muted">本轮未从候选线路中选出推荐，以下是检索到的候选。</div>
      )}

      {others.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => setShowOthers((prev) => !prev)}
            className="text-xs text-muted hover:text-primary"
          >
            {showOthers ? "收起" : `其他检索候选（未推荐）· ${others.length} 条 ▾`}
          </button>
          {showOthers ? (
            <div className="mt-2 space-y-2 opacity-75">
              {others.map((source) => (
                <SourceCard
                  key={source.route_id}
                  source={source}
                  onViewMap={onViewMap}
                  checklists={checklists}
                  openChecklistId={openChecklistId}
                  onToggleChecklist={onToggleChecklist}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SourceCard({
  source,
  isFocused,
  onFocus,
  onViewMap,
  checklists,
  openChecklistId,
  onToggleChecklist,
}: {
  source: ChatSource;
  isFocused?: boolean;
  onFocus?: () => void;
  onViewMap: (routeId: string, routeName: string) => void;
  checklists?: Record<string, ChecklistItem[]>;
  openChecklistId?: string | null;
  onToggleChecklist?: (routeId: string) => void;
}) {
  const card = source.route_card;
  const isBeginner =
    card?.difficulty_band === "easy" || (card?.difficulty_label ?? "").includes("新手");
  const checklist = checklists?.[source.route_id];
  const checklistOpen = openChecklistId === source.route_id;
  return (
    <div
      className="frost-strong rounded-2xl p-3"
      style={isFocused ? { border: "1px solid rgba(29,124,87,0.3)", background: "var(--primary-soft)" } : undefined}
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold text-ink">{source.route_name}</div>
          {isFocused ? <span className="chip chip-emerald">聚焦中</span> : null}
          {source.recommended ? <span className="chip chip-warn">推荐</span> : null}
          {isBeginner ? <span className="chip chip-warn">新手友好</span> : null}
        </div>
        <div className="mt-0.5 text-xs text-muted">
          {[card?.province_name, card?.city_name, card?.area_name].filter(Boolean).join(" / ") || source.city_name}
          {card?.route_type_label ? ` · ${card.route_type_label}` : ""}
          {card?.difficulty_label ? ` · ${card.difficulty_label}` : ""}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        {card?.distance_km != null ? <Tag label="里程" value={formatMetric(card.distance_km, " km")} /> : null}
        {card?.duration_hours != null ? <Tag label="耗时" value={formatMetric(card.duration_hours, " h")} /> : null}
        {card?.ascent_m != null ? <Tag label="爬升" value={formatMetric(card.ascent_m, " m")} /> : null}
        {!card?.distance_km && !card?.duration_hours && !card?.ascent_m ? (
          <span className="chip chip-gray">数据待补</span>
        ) : null}
        {onFocus && !isFocused ? (
          <button
            type="button"
            onClick={onFocus}
            className="rounded-md border px-2.5 py-1 text-xs font-medium text-primary"
            style={{ borderColor: "rgba(29,124,87,0.28)" }}
          >
            聚焦这条线
          </button>
        ) : null}
        {onToggleChecklist ? (
          <button
            type="button"
            onClick={() => onToggleChecklist(source.route_id)}
            className="rounded-md px-2.5 py-1 text-xs font-medium"
            style={{ border: "1px solid rgba(29,124,87,0.28)", color: "var(--primary)" }}
          >
            {checklistOpen ? "收起清单" : "出发前清单"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onViewMap(source.route_id, source.route_name)}
          className="btn-primary px-2.5 py-1 text-xs"
        >
          查看地图
        </button>
      </div>

      {checklistOpen && checklist ? <ChecklistPanel items={checklist} /> : null}
    </div>
  );
}

function ChecklistPanel({ items }: { items: ChecklistItem[] }) {
  return (
    <div className="mt-3 rounded-md border border-white/70 bg-white/60 p-3 text-xs">
      <div className="mb-2 font-medium text-ink">出发前 checklist（依据线路资料整理）</div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.dimension}>
            <div className="font-medium text-ink">
              {item.label}
              {item.mentioned ? null : <span className="ml-1 text-muted">· 资料未提及</span>}
            </div>
            {item.mentioned ? (
              <ul className="mt-1 list-disc space-y-1 pl-4 text-muted">
                {item.quotes.map((quote, index) => (
                  <li key={index}>{quote}</li>
                ))}
              </ul>
            ) : (
              <div className="mt-0.5 text-muted">暂无相关说明，请自行确认。</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tag({ label, value }: { label: string; value: string }) {
  return (
    <span className="chip chip-gray">
      <span style={{ color: "#9ca3af", marginRight: 4 }}>{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </span>
  );
}
