/** 绿森林设计语言：关键节点 / 风险 / 下撤 的语义色板 */
export type Kind = "start" | "end" | "node" | "risk" | "exit";

export const kindTheme: Record<
  Kind,
  { badgeBg: string; badgeColor: string; cardBg: string; border: string; label: string }
> = {
  start: { badgeBg: "#dff5e8", badgeColor: "#15803d", cardBg: "#f0fdf4", border: "rgba(22,163,74,0.2)", label: "起点" },
  end: { badgeBg: "#e6f4ee", badgeColor: "#1d7c57", cardBg: "#f3faf6", border: "rgba(29,124,87,0.22)", label: "终点" },
  node: { badgeBg: "#e7f0fb", badgeColor: "#1d4ed8", cardBg: "#f3f8fe", border: "rgba(29,78,216,0.18)", label: "节点" },
  risk: { badgeBg: "#fff3d8", badgeColor: "#92680a", cardBg: "#fffaf0", border: "rgba(146,104,10,0.2)", label: "风险" },
  exit: { badgeBg: "#e6f4ee", badgeColor: "#1d7c57", cardBg: "#f3faf6", border: "rgba(29,124,87,0.22)", label: "下撤" },
};
