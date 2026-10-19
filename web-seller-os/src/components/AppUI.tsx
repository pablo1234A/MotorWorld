import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AgendaItem, Prospect } from '../data/types';
import { CloseModal, ItemModal, ProspectModal, TouchModal } from './forms';
import { useStore } from '../data/store';

interface UIApi {
  newProspect(initial?: Partial<Prospect>, onSaved?: (p: Prospect) => void): void;
  editProspect(p: Prospect): void;
  newItem(initial?: Partial<AgendaItem>): void;
  editItem(i: AgendaItem): void;
  logTouch(p: Prospect): void;
  closeDeal(p: Prospect, mode: 'ganado' | 'perdido'): void;
  openPalette(): void;
  openWhatNow(): void;
  openFocus(): void;
  openShortcuts(): void;
  palette: boolean;
  whatNow: boolean;
  focus: boolean;
  shortcuts: boolean;
  setPalette(v: boolean): void;
  setWhatNow(v: boolean): void;
  setFocus(v: boolean): void;
  setShortcuts(v: boolean): void;
}

const Ctx = createContext<UIApi | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const { state } = useStore();
  const [prospectModal, setProspectModal] = useState<{ initial?: Partial<Prospect>; onSaved?: (p: Prospect) => void } | null>(null);
  const [itemModal, setItemModal] = useState<{ initial?: Partial<AgendaItem> } | null>(null);
  const [touchId, setTouchId] = useState<string | null>(null);
  const [closeReq, setCloseReq] = useState<{ id: string; mode: 'ganado' | 'perdido' } | null>(null);
  const [palette, setPalette] = useState(false);
  const [whatNow, setWhatNow] = useState(false);
  const [focus, setFocus] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);

  const api = useMemo<UIApi>(
    () => ({
      newProspect: (initial, onSaved) => setProspectModal({ initial, onSaved }),
      editProspect: (p) => setProspectModal({ initial: p }),
      newItem: (initial) => setItemModal({ initial }),
      editItem: (i) => setItemModal({ initial: i }),
      logTouch: (p) => setTouchId(p.id),
      closeDeal: (p, mode) => setCloseReq({ id: p.id, mode }),
      openPalette: () => setPalette(true),
      openWhatNow: () => setWhatNow(true),
      openFocus: () => setFocus(true),
      openShortcuts: () => setShortcuts(true),
      palette,
      whatNow,
      focus,
      shortcuts,
      setPalette,
      setWhatNow,
      setFocus,
      setShortcuts,
    }),
    [palette, whatNow, focus, shortcuts],
  );

  const closeProspect = useCallback(() => setProspectModal(null), []);
  const closeItem = useCallback(() => setItemModal(null), []);
  const touchProspect = touchId ? state.prospects.find((p) => p.id === touchId) ?? null : null;
  const closeProspectObj = closeReq ? state.prospects.find((p) => p.id === closeReq.id) ?? null : null;

  // cerrar overlays al navegar
  useEffect(() => {
    const on = () => {
      setPalette(false);
      setWhatNow(false);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  return (
    <Ctx.Provider value={api}>
      {children}
      <ProspectModal open={!!prospectModal} onClose={closeProspect} initial={prospectModal?.initial} onSaved={prospectModal?.onSaved} />
      <ItemModal open={!!itemModal} onClose={closeItem} initial={itemModal?.initial} />
      <TouchModal prospect={touchProspect} onClose={() => setTouchId(null)} />
      {closeReq && <CloseModal prospect={closeProspectObj} mode={closeReq.mode} onClose={() => setCloseReq(null)} />}
    </Ctx.Provider>
  );
}

export function useUI() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUI fuera de UIProvider');
  return v;
}
