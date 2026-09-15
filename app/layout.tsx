import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Hiking Route Admin Backend",
  description: "Minimal runnable admin backend for the hiking route project",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
