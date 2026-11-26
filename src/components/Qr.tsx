"use client";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function Qr({ value, size = 180 }: { value: string; size?: number }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: size * 2, color: { dark: "#000e52", light: "#ffffff" } }).then(setSrc);
  }, [value, size]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} width={size} height={size} alt="QR code" className="rounded-lg" /> : <div style={{ width: size, height: size }} className="animate-pulse rounded-lg bg-paper" />;
}
