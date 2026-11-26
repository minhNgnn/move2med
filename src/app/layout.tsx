import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { LangProvider, type Lang } from "@/lib/lang";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "move2med: digital patient transport",
  description: "From paper form to digital workflow: a ride key for transport companies outside the Telematics Infrastructure.",
};
export const viewport: Viewport = { themeColor: "#000e52", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang: Lang = (await cookies()).get("m2m_lang")?.value === "de" ? "de" : "en";
  return (
    <html lang={lang} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <LangProvider initial={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
