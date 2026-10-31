"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

/** Diálogo accesible basado en <dialog> nativo (foco atrapado y Escape). */
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={clsx(
        "m-auto w-[calc(100%-24px)] rounded-xl border border-ink-200 bg-white p-0 text-ink-800 shadow-pop backdrop:bg-ink-900/40",
        wide ? "max-w-3xl" : "max-w-lg",
      )}
    >
      {open ? (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-ink-100 px-5 py-4">
            <h2 className="text-base font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-ink-500 hover:bg-ink-100" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-5">{children}</div>
          {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 px-5 py-3.5">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}
