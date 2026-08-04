import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "猹猹岛｜附近有瓜，先吃再说",
  description: "在城市主岛发现公共瓜点里的匿名生活故事，吃瓜留籽，也把自己的故事埋进土里。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
