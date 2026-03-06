import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import Providers from "@/components/Providers";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Slack Multi-Window",
  description: "Slack multi-workspace task management app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${geistMono.variable} font-mono antialiased bg-[#0F1117] text-white`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
