import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "猹猹街｜附近城市的匿名故事",
  description: "在城市瓜区发现附近的匿名生活故事，成熟瓜可直接打开，现场范围只用于文字评论资格。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}<SiteFooter /></body>
    </html>
  );
}
