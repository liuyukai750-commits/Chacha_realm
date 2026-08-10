import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "猹猹街｜附近城市的匿名故事",
  description: "在城市瓜区发现附近的匿名生活故事，直接吃日常小瓜，或顺藤摸瓜找到现场大瓜。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
