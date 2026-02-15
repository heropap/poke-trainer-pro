import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Poke-Trainer Pro",
  description: "Pokemon TCG 对战模拟器 - 全环境覆盖的智能训练平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <nav className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight">Poke-Trainer Pro</span>
            </div>
            <div className="flex items-center gap-6 text-sm font-medium text-zinc-600 dark:text-zinc-400">
              <a href="/" className="hover:text-zinc-900 dark:hover:text-zinc-100">
                首页
              </a>
              <a href="/cards" className="hover:text-zinc-900 dark:hover:text-zinc-100">
                图鉴
              </a>
              <a href="/deck" className="hover:text-zinc-900 dark:hover:text-zinc-100">
                卡组
              </a>
              <a href="/battle" className="hover:text-zinc-900 dark:hover:text-zinc-100">
                对战
              </a>
            </div>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
