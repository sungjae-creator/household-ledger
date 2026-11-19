import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "스마트 웹 가계부",
  description: "네이버 가계부 및 엑셀 연동 스마트 가계부",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="h-full antialiased font-sans">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
