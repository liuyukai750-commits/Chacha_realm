import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "猹猹岛｜晴日瓜田里的附近故事",
  description: "在晴日瓜田雷达中发现附近成熟的匿名生活故事，吃完留下一粒瓜籽。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
