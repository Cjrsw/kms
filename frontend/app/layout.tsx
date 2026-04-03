import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KMS MVP",
  description: "企业知识管理系统 MVP"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
