"use client";
import { Mic, MicOff, Send, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { api } from "@/lib/hooks";
import { useLang } from "@/lib/lang";
import { Button, Card, Input } from "./ui";

type Reply = { reply: string; kind: string; token?: string; options?: { label: string; token: string }[] };
type Line = { who: "you" | "assistant"; text: string };
type SR = { lang: string; interimResults: boolean; maxAlternatives: number; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };

/** Optional voice assistant for the patient. Typed input and the quick buttons never need voice, the model or a key. */
export function VoicePanel() {
  const { L, lang } = useLang();
  const [log, setLog] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [options, setOptions] = useState<Reply["options"]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const [speak, setSpeak] = useState(true);
  const recRef = useRef<SR | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setCanListen(!!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition)); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [log, options]);

  const say = useCallback((s: string) => {
    if (!speak || typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(s);
    u.lang = lang === "de" ? "de-DE" : "en-GB";
    u.rate = 0.92; // slightly slower for an elderly listener
    speechSynthesis.speak(u);
  }, [speak, lang]);

  const send = useCallback(async (body: Record<string, unknown>, shown?: string) => {
    if (shown) setLog((l) => [...l, { who: "you", text: shown }]);
    setBusy(true); setOptions([]);
    try {
      const r = await api<Reply>("/api/patient/assistant", { body: { lang, ...body } });
      setLog((l) => [...l, { who: "assistant", text: r.reply }]);
      setToken(r.kind === "readback" ? r.token ?? null : null);
      setOptions(r.kind === "clarify" ? r.options ?? [] : []);
      say(r.reply);
    } catch (e) {
      const m = (e as Error).message;
      setLog((l) => [...l, { who: "assistant", text: m }]);
    } finally { setBusy(false); }
  }, [lang, say]);

  const ask = (t: string) => { const v = t.trim(); if (!v) return; setText(""); send({ text: v, ...(token ? { token } : {}) }, v); };

  function listen() {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) return;
    if (listening) { recRef.current?.stop(); return; }
    speechSynthesis?.cancel();
    const rec = new Ctor();
    rec.lang = lang === "de" ? "de-DE" : "en-GB";
    rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = (e) => ask(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = (e) => { setListening(false); if (e.error !== "no-speech" && e.error !== "aborted") setLog((l) => [...l, { who: "assistant", text: L("I could not use the microphone. Please type, or use the buttons.", "Ich konnte das Mikrofon nicht nutzen. Bitte tippen Sie oder nutzen Sie die Knöpfe.") }]); };
    recRef.current = rec; setListening(true); rec.start();
  }

  return (
    <Card title={<span className="flex items-center gap-2"><Mic className="h-4 w-4 text-cyan" /> {L("Ask about your rides", "Fragen zu Ihren Fahrten")}</span>}>
      <div className="space-y-4" data-testid="voice-panel">
        <div className="max-h-72 space-y-2 overflow-y-auto" aria-live="polite">
          {!log.length && <p className="text-muted">{L("Press the microphone and say, for example: “When is my next ride?” Or use the buttons.", "Drücken Sie das Mikrofon und sagen Sie zum Beispiel: „Wann ist meine nächste Fahrt?“ Oder nutzen Sie die Knöpfe.")}</p>}
          {log.map((m, i) => (
            <div key={i} data-testid={m.who === "assistant" ? "assistant-reply" : "your-line"} className={clsx("max-w-[92%] rounded-2xl px-4 py-2.5 text-base", m.who === "you" ? "ml-auto rounded-tr-md bg-ink text-white" : "rounded-tl-md bg-paper text-text")}>{m.text}</div>
          ))}
          <div ref={endRef} />
        </div>

        {token && (
          <div className="flex gap-3" data-testid="readback-buttons">
            <Button size="lg" variant="good" className="flex-1" disabled={busy} onClick={() => { send({ answer: "yes", token }, L("Yes", "Ja")); }}>{L("Yes, cancel it", "Ja, absagen")}</Button>
            <Button size="lg" variant="secondary" className="flex-1" disabled={busy} onClick={() => { send({ answer: "no", token }, L("No", "Nein")); }}>{L("No", "Nein")}</Button>
          </div>
        )}
        {!!options?.length && (
          <div className="grid gap-2">
            {options.map((o) => <Button key={o.token} variant="secondary" disabled={busy} onClick={() => send({ pick: o.token }, o.label)}>{o.label}</Button>)}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => send({ button: "next" }, L("When is my next ride?", "Wann ist meine nächste Fahrt?"))}>{L("When is my next ride?", "Wann ist meine nächste Fahrt?")}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => send({ button: "driver" }, L("Where is my driver?", "Wo ist mein Fahrer?"))}>{L("Where is my driver?", "Wo ist mein Fahrer?")}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => send({ button: "cancel_next" }, L("Cancel my next ride", "Nächste Fahrt absagen"))}>{L("Cancel my next ride", "Nächste Fahrt absagen")}</Button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); ask(text); }} className="flex gap-2">
          {canListen && (
            <Button type="button" size="lg" variant={listening ? "danger" : "primary"} onClick={listen} aria-label={L("Microphone", "Mikrofon")} className={listening ? "pulse-ring" : ""}>
              {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>
          )}
          <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={L("Or type here…", "Oder hier tippen…")} className="!py-3.5 !text-base" aria-label={L("Your question", "Ihre Frage")} />
          <Button type="submit" size="lg" disabled={busy || !text.trim()} aria-label={L("Send", "Senden")}><Send className="h-5 w-5" /></Button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <label className="flex items-center gap-2"><input type="checkbox" checked={speak} onChange={(e) => { setSpeak(e.target.checked); if (!e.target.checked) speechSynthesis?.cancel(); }} /> <Volume2 className="h-3.5 w-3.5" /> {L("Read answers aloud", "Antworten vorlesen")}</label>
          <span>{L("Your browser may send what you say to its maker for recognition. We do not record or store it.", "Ihr Browser sendet das Gesagte zur Erkennung eventuell an den Hersteller. Wir nehmen nichts auf und speichern nichts.")}</span>
        </div>
      </div>
    </Card>
  );
}
