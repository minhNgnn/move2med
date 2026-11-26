import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "move2med driver",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "move2med", statusBarStyle: "black-translucent" },
  icons: { apple: "/apple-touch-icon.png", icon: "/icon.svg" },
};
export const viewport: Viewport = { themeColor: "#000e52", width: "device-width", initialScale: 1, maximumScale: 1, viewportFit: "cover" };

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return children;
}
