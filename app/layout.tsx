import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "苏州地铁 · 全站时刻",
  description: "按线路和车站查询苏州地铁实时班次、到站参考倒计时与一周计划时刻。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
