"use client";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { flagText } from "@/lib/rules";
import type { Flag } from "@/lib/types";
import { useL } from "@/lib/lang";

export function Logo({ size = 28, light = false }: { size?: number; light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#009fe3" />
        <path d="M7 21c3-9 6-9 9-4s6 5 9-4" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="7" cy="21" r="2.4" fill="#000e52" stroke="#fff" strokeWidth="1.6" />
        <circle cx="25" cy="13" r="2.4" fill="#fff" />
      </svg>
      <span className={light ? "text-white" : "text-ink"} style={{ fontSize: size * 0.68 }}>
        move<span className="text-cyan">2</span>med
      </span>
    </span>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "good";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};
export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "px-3 py-1.5 text-sm",
        size === "md" && "px-4 py-2.5 text-sm",
        size === "lg" && "px-6 py-4 text-lg",
        variant === "primary" && "bg-ink text-white hover:bg-ink-soft",
        variant === "secondary" && "border border-line bg-white text-ink hover:bg-cyan-soft",
        variant === "ghost" && "text-ink hover:bg-cyan-soft",
        variant === "danger" && "bg-bad text-white hover:opacity-90",
        variant === "good" && "bg-good text-white hover:opacity-90",
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ title, actions, children, className, tone }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; tone?: "cyan" | "warn" | "bad" | "good" }) {
  return (
    <section
      className={clsx(
        "rounded-2xl border bg-white shadow-[0_1px_2px_rgba(0,14,82,0.04)]",
        tone === "cyan" && "border-cyan/40 bg-cyan-soft/50",
        tone === "warn" && "border-warn/30 bg-warn-soft",
        tone === "bad" && "border-bad/30 bg-bad-soft",
        tone === "good" && "border-good/30 bg-good-soft",
        !tone && "border-line",
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line/70 px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const TONES = {
  neutral: "bg-paper text-muted ring-line",
  good: "bg-good-soft text-good ring-good/20",
  warn: "bg-warn-soft text-warn ring-warn/25",
  bad: "bg-bad-soft text-bad ring-bad/25",
  info: "bg-cyan-soft text-ink ring-cyan/30",
  ink: "bg-ink text-white ring-ink",
};
export function Badge({ tone = "neutral", children, className, title }: { tone?: keyof typeof TONES; children: ReactNode; className?: string; title?: string }) {
  return <span title={title} className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>{children}</span>;
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
const inputCls = "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-text outline-none transition placeholder:text-muted/60 focus:border-cyan focus:ring-4 focus:ring-cyan/15 disabled:bg-paper disabled:text-muted";
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={clsx(inputCls, className)} />;
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={clsx(inputCls, "pr-8", className)} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={clsx(inputCls, "min-h-20", className)} />;

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; badge?: number | string | null }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-2xl border border-line bg-white p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={clsx("flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition", value === t.id ? "bg-ink text-white" : "text-muted hover:bg-cyan-soft hover:text-ink")}
        >
          {t.label}
          {t.badge ? <span className={clsx("rounded-full px-1.5 text-xs", value === t.id ? "bg-white/20" : "bg-cyan-mid text-ink")}>{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function FlagList({ flags, hideInfo }: { flags: Flag[]; hideInfo?: boolean }) {
  const L = useL();
  const list = hideInfo ? flags.filter((f) => f.severity !== "info") : flags;
  if (!list.length) return null;
  return (
    <ul className="space-y-1.5">
      {list.map((f, i) => (
        <li
          key={i}
          className={clsx(
            "flex items-start gap-2 rounded-xl px-3 py-2 text-sm",
            f.severity === "error" && "bg-bad-soft text-bad",
            f.severity === "warn" && "bg-warn-soft text-warn",
            f.severity === "info" && "bg-cyan-soft text-ink",
          )}
        >
          {f.severity === "error" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> : f.severity === "warn" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{flagText(f, L)}</span>
        </li>
      ))}
    </ul>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-bad/25 bg-bad-soft px-3.5 py-2.5 text-sm text-bad">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
export function OkBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-good/25 bg-good-soft px-3.5 py-2.5 text-sm text-good">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
export const Spinner = () => <Loader2 className="h-5 w-5 animate-spin text-cyan" />;
export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{children}</p>;
}

export function KV({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line/60 py-1.5 text-sm last:border-0">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right font-medium text-text">{children}</dd>
    </div>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-paper text-xs uppercase tracking-wide text-muted">
          <tr>{head.map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-2.5 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line/70 bg-white">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={clsx("px-4 py-2.5 align-top", className)}>{children}</td>;

export function CodeChip({ children }: { children: ReactNode }) {
  return <span className="rounded-lg bg-ink px-2.5 py-1 font-mono text-sm tracking-widest text-white">{children}</span>;
}
