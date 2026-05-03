import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pokemon TCG · v0",
  description: "Pokemon TCG — PTCG Live 风格的桌面浏览器对战，从三套官方大师卡组开始。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
