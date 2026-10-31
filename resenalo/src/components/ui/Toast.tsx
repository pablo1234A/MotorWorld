"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import clsx from "clsx";
import { CheckCircle2, XCircle } from "lucide-react";

type ToastT = { id: number; tone: "ok" | "bad"; text: string };
const Ctx = createContext<(tone: "ok" | "bad", text: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastT[]>([]);
  const push = useCallback((tone: "ok" | "bad", text: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s.slice(-2), { id, tone, text }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), tone === "bad" ? 7000 : 4000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={clsx("pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-lg border bg-white px-4 py-3 text-sm shadow-pop", t.tone === "ok" ? "border-ok-600/25" : "border-bad-600/25")}>
            {t.tone === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad-600" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
