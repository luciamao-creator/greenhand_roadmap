"use client";

import { useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import ChatPanel from "./ChatPanel";
import MapPanel from "./MapPanel";
import HomePanel from "./HomePanel";
import MePanel from "./MePanel";

type Tab = "home" | "chat" | "map" | "me";

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#1d7c57" : "#9aa8a0"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}
function ChatIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#1d7c57" : "#9aa8a0"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" />
      <path d="M8.5 11.5h7M8.5 14.5h4" />
    </svg>
  );
}
function MapIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#1d7c57" : "#9aa8a0"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4 3.5 6.2v13.3L9 17.3l6 2.9 5.5-2.2V4.8L15 7.1 9 4Z" />
      <path d="M9 4v13.3M15 7.1V20" />
    </svg>
  );
}
function MeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#1d7c57" : "#9aa8a0"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </svg>
  );
}

export default function MobileShell({
  initialTab = "home",
  initialRoute = null,
}: {
  initialTab?: Tab;
  initialRoute?: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(initialRoute);
  const [selectedRouteName, setSelectedRouteName] = useState<string | null>(null);
  const [focusRouteId, setFocusRouteId] = useState<string | null>(null);
  const [focusName, setFocusName] = useState<string | null>(null);

  const openMap = (id: string, name: string) => {
    setSelectedRouteId(id);
    setSelectedRouteName(name);
    setTab("map");
  };
  const openChat = (id: string, name: string) => {
    setFocusRouteId(id);
    setFocusName(name);
    setTab("chat");
  };
  const selectRoute = (id: string, name: string) => {
    setSelectedRouteId(id);
    setSelectedRouteName(name);
  };

  const title =
    tab === "home" ? "新手徒步路线库" : tab === "chat" ? "问路线 · 智能对话" : tab === "me" ? "我的" : selectedRouteName ? `地图 · ${selectedRouteName}` : "线路地图";
  const subtitle =
    tab === "home"
      ? "从知识库真实线路里挑一条适合你的"
      : tab === "chat"
        ? "语义检索 + 引用溯源，可多轮追问"
        : tab === "me"
          ? "登录后收藏线路，数据保存在服务端"
          : "真实轨迹与关键节点（高德步行路网）";

  const tabs: [Tab, string, (props: { active: boolean }) => ReactElement][] = [
    ["home", "首页", HomeIcon],
    ["chat", "对话", ChatIcon],
    ["map", "地图", MapIcon],
    ["me", "我的", MeIcon],
  ];

  return (
    <div
      className="fixed left-0 top-0 flex h-screen w-full justify-center overflow-hidden"
      style={{ height: "100dvh", background: "transparent" }}
    >
      <div className="flex h-full w-full max-w-[460px] flex-col overflow-hidden border-x border-white/60 bg-white/40 backdrop-blur-xl">
        <header className="relative flex-shrink-0 px-5 pb-3 pt-4" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
          <div className="mx-auto pr-16">
            <h1 className="serif text-xl font-bold tracking-tight text-ink">{title}</h1>
            <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/submit")}
            className="absolute flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
            style={{
              right: 16,
              top: "max(1rem, env(safe-area-inset-top))",
              background: "var(--primary)",
              boxShadow: "0 10px 24px rgba(29,124,87,0.28)",
            }}
          >
            ＋ 提供路线
          </button>
        </header>

        <div className="min-h-0 flex-1">
          {tab === "home" && <HomePanel onOpenMap={openMap} onOpenChat={openChat} />}
          {tab === "chat" && (
            <ChatPanel
              focusRouteId={focusRouteId}
              focusName={focusName}
              onFocusChange={(id, name) => {
                setFocusRouteId(id);
                setFocusName(name);
              }}
              onViewMap={openMap}
            />
          )}
          {tab === "map" && (
            <MapPanel
              routeId={selectedRouteId}
              routeName={selectedRouteName}
              onOpenChat={openChat}
              onSelectRoute={selectRoute}
              onNeedLogin={() => setTab("me")}
            />
          )}
          {tab === "me" && <MePanel onOpenMap={openMap} />}
        </div>

        <nav
          className="flex h-[68px] shrink-0 border-t border-white/70 bg-white/80 backdrop-blur-xl"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {tabs.map(([key, label, Icon]) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className="flex flex-1 flex-col items-center justify-center gap-1 transition"
                style={{ color: active ? "#1d7c57" : "#9aa8a0" }}
              >
                <Icon active={active} />
                <span className="text-[11px] font-medium">{label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
