import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "KMS MVP",
  description: "企业知识管理系统 MVP"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${inter.className} bg-slate-50 text-slate-900 antialiased selection:bg-indigo-100 selection:text-indigo-900`}>
        {children}
      </body>
    </html>
  );
}
