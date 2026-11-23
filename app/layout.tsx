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

const staging = process.env.FLO_APP_ENV === "staging";

export const metadata: Metadata = {
  title: staging ? "FLO Golf Tour · Staging" : "FLO Golf Tour",
  robots: staging ? { index: false, follow: false } : undefined,
  description: "Player ratings and weekly draft board",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {staging && (
          <div className="bg-amber-200 px-4 py-1.5 text-center text-sm font-semibold text-amber-950">
            Staging · Test data
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
