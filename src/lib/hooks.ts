"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: opts?.method ?? (opts?.body !== undefined ? "POST" : "GET"),
    headers: { "content-type": "application/json" },
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error ?? res.statusText, json.code);
  return json as T;
}

/** Poll an endpoint every few seconds (live updates across devices; survives flaky Wi-Fi, unlike a socket). */
export function usePoll<T = any>(path: string | null, ms = 2500) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (!path) return;
    try {
      const d = await api<T>(path);
      if (alive.current) { setData(d); setError(null); }
    } catch (e) {
      if (alive.current) setError(e as ApiError);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    alive.current = true;
    load();
    if (!path) return;
    const t = setInterval(() => { if (!document.hidden) load(); }, ms);
    return () => { alive.current = false; clearInterval(t); };
  }, [load, ms, path]);
  return { data, error, loading, reload: load };
}

export const fmtTime = (iso: string | Date | null | undefined, lang = "en") =>
  iso ? new Date(iso).toLocaleTimeString(lang === "de" ? "de-DE" : "en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Berlin" }) : "–";
export const fmtDateTime = (iso: string | Date | null | undefined, lang = "en") =>
  iso ? new Date(iso).toLocaleString(lang === "de" ? "de-DE" : "en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }) : "–";
export const fmtDate = (d: string, lang = "en") =>
  new Date(d + "T12:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "en-GB", { weekday: "short", day: "2-digit", month: "short" });
export const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
