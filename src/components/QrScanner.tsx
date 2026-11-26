"use client";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useL } from "@/lib/lang";

/** Live camera scan with jsQR (works in Safari on iPhone too, where BarcodeDetector is missing). */
export function QrScanner({ onCode, onClose }: { onCode: (text: string) => void; onClose: () => void }) {
  const L = useL();
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const jsQR = (await import("jsqr")).default;
        const cv = document.createElement("canvas");
        const ctx = cv.getContext("2d", { willReadFrequently: true })!;
        let last = 0;
        const tick = (t: number) => {
          if (stopped) return;
          if (t - last > 140 && v.videoWidth) {
            last = t;
            cv.width = v.videoWidth; cv.height = v.videoHeight;
            ctx.drawImage(v, 0, 0);
            const q = jsQR(ctx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height);
            if (q?.data) { stopped = true; navigator.vibrate?.(60); onCode(q.data); return; }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setErr(L("The camera is not available. Allow camera access, or use a photo of the QR code.", "Die Kamera ist nicht verfügbar. Kamerazugriff erlauben oder ein Foto des QR-Codes nutzen."));
      }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [onCode, L]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
      <div className="flex items-center justify-between p-4 text-white">
        <span className="font-medium">{L("Point the camera at the QR code on the letter", "Kamera auf den QR-Code im Brief richten")}</span>
        <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Close"><X className="h-6 w-6" /></button>
      </div>
      <div className="relative mx-auto flex w-full max-w-md flex-1 items-center justify-center px-4">
        <video ref={video} playsInline muted className="max-h-[70vh] w-full rounded-2xl bg-black object-cover" />
        <div className="pointer-events-none absolute h-56 w-56 rounded-3xl border-4 border-cyan" />
      </div>
      {err && <p className="mx-auto max-w-md px-6 pb-8 text-center text-sm text-white">{err}</p>}
    </div>
  );
}
