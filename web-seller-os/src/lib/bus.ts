// Bus de eventos mínimo para efectos de UI (toasts, confeti, sonido, XP)
// desacoplados de la lógica de datos.
export type BusEvent =
  | { type: 'toast'; message: string; tone?: 'ok' | 'info' | 'warn' | 'error'; action?: { label: string; run: () => void } }
  | { type: 'xp'; amount: number; reason: string }
  | { type: 'celebrate' }
  | { type: 'levelup'; level: number; name: string };

type Listener = (e: BusEvent) => void;
const listeners = new Set<Listener>();

export const bus = {
  emit(e: BusEvent) {
    listeners.forEach((l) => l(e));
  },
  on(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export const toast = (message: string, tone: 'ok' | 'info' | 'warn' | 'error' = 'ok', action?: { label: string; run: () => void }) =>
  bus.emit({ type: 'toast', message, tone, action });
