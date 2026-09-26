import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "新手徒步路线库 · AI 路线助手",
  description: "基于知识库真实线路的徒步新手路线推荐：语义检索 + 引用溯源 + 真实轨迹地图",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
