"use client";

import { useCallback, useEffect, useState } from "react";

type Me = { user_id: string; username: string; created_at: string };
type Favorite = { route_id: string; route_name: string; saved_at: string };

export default function MePanel({ onOpenMap }: { onOpenMap: (id: string, name: string) => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [booting, setBooting] = useState(true);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [favorites, setFavorites] = useState<Favorite[]>([]);

  const loadFavorites = useCallback(() => {
    fetch("/api/user/favorites")
      .then((r) => r.json())
      .then((p) => { if (p.code === "OK") setFavorites(p.data.favorites as Favorite[]); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((p) => {
        if (p.code === "OK" && p.data?.user) setMe(p.data.user as Me);
      })
      .catch(() => {})
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (me) loadFavorites();
  }, [me, loadFavorites]);

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const p = await res.json();
      if (p.code === "OK" && p.data?.user) {
        setMe(p.data.user as Me);
        setPassword("");
      } else {
        setErr(p.message || "操作失败");
      }
    } catch {
      setErr("网络异常，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setMe(null);
    setFavorites([]);
    setUsername("");
    setPassword("");
    setMode("login");
  };

  const removeFav = async (routeId: string) => {
    const res = await fetch(`/api/user/favorites?routeId=${encodeURIComponent(routeId)}`, { method: "DELETE" }).catch(() => null);
    if (res) {
      const p = await res.json().catch(() => null);
      if (p?.code === "OK") setFavorites(p.data.favorites as Favorite[]);
    }
  };

  if (booting) {
    return <div className="grid h-full place-items-center text-sm text-muted">加载中…</div>;
  }

  if (!me) {
    return (
      <div className="h-full overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-sm">
          <h2 className="serif text-lg font-bold text-ink">{mode === "login" ? "登录账号" : "注册账号"}</h2>
          <p className="mt-1 text-xs text-muted">登录后可收藏线路、同步出行清单，数据保存在服务端。</p>
          <div className="mt-4 space-y-3">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="用户名（2-24 位字母/数字/中文/下划线）"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码（至少 6 位）"
              type="password"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
              onKeyDown={(e) => { if (e.key === "Enter" && !busy) void submit(); }}
            />
            {err ? <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{err}</div> : null}
            <button type="button" disabled={busy || !username || !password} onClick={submit} className="btn-primary w-full px-4 py-2.5 text-sm disabled:opacity-50">
              {busy ? "处理中…" : mode === "login" ? "登录" : "注册并登录"}
            </button>
            <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(null); }} className="w-full text-center text-xs text-muted underline-offset-2 hover:underline">
              {mode === "login" ? "还没有账号？去注册" : "已有账号？去登录"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-4">
      <div className="mx-auto max-w-sm space-y-3">
        <div className="frost-strong flex items-center justify-between p-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-full text-sm font-bold text-white" style={{ background: "var(--primary)" }}>
              {me.username.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-bold text-ink">{me.username}</div>
              <div className="text-[11px] text-muted">注册于 {me.created_at.slice(0, 10)}</div>
            </div>
          </div>
          <button type="button" onClick={logout} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-500">退出</button>
        </div>

        <div className="text-sm font-semibold text-ink">我的收藏（{favorites.length}）</div>
        {favorites.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white/60 p-4 text-center text-xs text-muted">
            还没有收藏。在「地图」页打开一条线路后即可收藏。
          </div>
        ) : (
          favorites.map((f) => (
            <div key={f.route_id} className="frost-strong flex items-center justify-between gap-2 p-3">
              <button type="button" onClick={() => onOpenMap(f.route_id, f.route_name)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-sm font-semibold text-ink">{f.route_name}</div>
                <div className="text-[11px] text-muted">收藏于 {f.saved_at.slice(0, 10)} · 点击查看地图</div>
              </button>
              <button type="button" onClick={() => removeFav(f.route_id)} className="flex-shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-500">移除</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
