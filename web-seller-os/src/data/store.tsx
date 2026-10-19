import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  Activity,
  ActivityType,
  AgendaItem,
  AppState,
  AuditRecord,
  Channel,
  Goals,
  Profile,
  Prospect,
  Resource,
  RoleplayResult,
  Settings,
  Stage,
} from './types';
import { STAGES } from './types';
import { initialState, migrate, newProspect } from './defaults';
import { LocalStorageAdapter, type StorageAdapter } from './storage';
import { uid } from '../lib/format';
import { addDays, today } from '../lib/dates';
import { XP, dailyMission, levelFor, totalXp } from '../lib/progress';
import { bus, toast } from '../lib/bus';

interface Actions {
  completeOnboarding(profile: Profile, goals: Goals): void;
  updateProfile(p: Partial<Profile>): void;
  updateSettings(s: Partial<Settings>): void;
  updateGoals(g: Goals): void;

  addProspect(p: Partial<Prospect>): Prospect;
  addProspects(list: Partial<Prospect>[]): number;
  updateProspect(id: string, patch: Partial<Prospect>): void;
  deleteProspect(id: string): void;
  setStage(id: string, stage: Stage, opts?: { amount?: number; reason?: string }): void;
  /** Registra un contacto real (primer contacto o seguimiento) y recalcula la secuencia. */
  logTouch(id: string, channel: Channel, note?: string): void;
  logReply(id: string, note?: string): void;
  setNextFollowUp(id: string, day: string | null): void;
  deleteActivity(id: string): void;
  /** Restaura un prospecto a una instantánea y elimina las actividades que generó el cambio. */
  undoProspectChange(snapshot: Prospect, activityIdsBefore: Set<string>): void;

  addItem(i: Partial<AgendaItem>): AgendaItem;
  updateItem(id: string, patch: Partial<AgendaItem>): void;
  deleteItem(id: string): void;
  toggleItem(id: string): void;

  addResource(r: Partial<Resource>): Resource;
  addResources(list: Partial<Resource>[]): void;
  updateResource(id: string, patch: Partial<Resource>): void;
  deleteResource(id: string): void;

  saveAudit(a: Omit<AuditRecord, 'id' | 'createdAt'>, problems: string[]): AuditRecord;
  completeTraining(): void;
  saveRoleplay(r: Omit<RoleplayResult, 'id' | 'at'>): void;

  markRead(ids: string[]): void;
  replaceState(s: AppState): void;
  resetAll(): void;
}

interface StoreValue {
  state: AppState;
  loading: boolean;
  actions: Actions;
}

const Ctx = createContext<StoreValue | null>(null);

const ACTIVE_STAGES: Stage[] = ['contactado', 'respondio', 'reunion', 'propuesta', 'negociacion'];

export function StoreProvider({ children, adapter }: { children: ReactNode; adapter?: StorageAdapter }) {
  const storage = useMemo(() => adapter ?? new LocalStorageAdapter(), [adapter]);
  const [state, setState] = useState<AppState>(initialState);
  const [loading, setLoading] = useState(true);
  const ref = useRef(state);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    storage.load().then((raw) => {
      if (!alive) return;
      const s = migrate(raw);
      ref.current = s;
      setState(s);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [storage]);

  const actions = useMemo<Actions>(() => {
    const persist = (s: AppState) => {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        storage.save(s).catch(() => toast('No se pudo guardar. Exporta una copia desde Ajustes.', 'error'));
      }, 200);
    };

    const commit = (fn: (s: AppState) => AppState) => {
      const next = fn(ref.current);
      ref.current = next;
      setState(next);
      persist(next);
      return next;
    };

    const touchProspect = (s: AppState, id: string, patch: Partial<Prospect>): AppState => ({
      ...s,
      prospects: s.prospects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)),
    });

    /** Añade una actividad, otorga XP y bonus de misión, y avisa de subidas de nivel. */
    const withActivity = (
      s: AppState,
      type: ActivityType,
      extra: Partial<Pick<Activity, 'prospectId' | 'channel' | 'amount' | 'note' | 'ref'>> = {},
    ): AppState => {
      const now = new Date();
      const a: Activity = {
        id: uid(),
        type,
        at: now.toISOString(),
        day: today(),
        prospectId: extra.prospectId ?? null,
        channel: extra.channel ?? null,
        amount: extra.amount ?? null,
        note: extra.note ?? '',
        xp: XP[type],
        ...(extra.ref ? { ref: extra.ref } : {}),
      };
      const before = levelFor(totalXp(s));
      let next: AppState = { ...s, activities: [...s.activities, a] };
      // bonus por misiones completadas hoy
      const t = today();
      const granted = new Set(next.bonuses.filter((b) => b.day === t).map((b) => b.id));
      const newBonuses = dailyMission(next).filter((m) => m.done >= m.target && !granted.has(m.id));
      if (newBonuses.length) {
        next = { ...next, bonuses: [...next.bonuses, ...newBonuses.map((m) => ({ day: t, id: m.id, xp: m.xp }))] };
        newBonuses.forEach((m) => setTimeout(() => toast(`Misión completada: ${m.label} · +${m.xp} XP`, 'ok'), 400));
      }
      const gained = totalXp(next) - totalXp(s);
      if (gained > 0) bus.emit({ type: 'xp', amount: gained, reason: type });
      const after = levelFor(totalXp(next));
      if (after.level > before.level) setTimeout(() => bus.emit({ type: 'levelup', level: after.level, name: after.name }), 600);
      return next;
    };

    const hasActivity = (s: AppState, prospectId: string, type: ActivityType) =>
      s.activities.some((a) => a.prospectId === prospectId && a.type === type);

    /** Próximo seguimiento según la secuencia configurada. */
    const nextFromSequence = (s: AppState, p: Prospect, step: number): string | null => {
      const seq = s.settings.sequence;
      if (!p.firstContact) return null;
      if (step + 1 >= seq.length) return null;
      const planned = addDays(p.firstContact, seq[step + 1]);
      const t = today();
      if (planned > t) return planned;
      const gap = Math.max(1, seq[step + 1] - (seq[step] ?? 0));
      return addDays(t, gap);
    };

    const a: Actions = {
      completeOnboarding(profile, goals) {
        commit((s) => ({ ...s, onboarded: true, profile, goals }));
      },
      updateProfile(p) {
        commit((s) => ({ ...s, profile: { ...s.profile, ...p } }));
      },
      updateSettings(p) {
        commit((s) => ({ ...s, settings: { ...s.settings, ...p } }));
      },
      updateGoals(g) {
        commit((s) => ({ ...s, goals: g }));
      },

      addProspect(partial) {
        const p = newProspect(partial);
        commit((s) => withActivity({ ...s, prospects: [p, ...s.prospects] }, 'prospect_added', { prospectId: p.id }));
        return p;
      },
      addProspects(list) {
        const ps = list.map((l) => newProspect(l));
        commit((s) => {
          let n: AppState = { ...s, prospects: [...ps, ...s.prospects] };
          for (const p of ps) n = withActivity(n, 'prospect_added', { prospectId: p.id });
          return n;
        });
        return ps.length;
      },
      updateProspect(id, patch) {
        commit((s) => touchProspect(s, id, patch));
      },
      deleteProspect(id) {
        commit((s) => ({
          ...s,
          prospects: s.prospects.filter((p) => p.id !== id),
          items: s.items.map((i) => (i.prospectId === id ? { ...i, prospectId: null } : i)),
        }));
      },
      setStage(id, stage, opts = {}) {
        commit((s) => {
          const p = s.prospects.find((x) => x.id === id);
          if (!p || p.stage === stage) return s;
          const t = today();
          const forward = STAGES.indexOf(stage) > STAGES.indexOf(p.stage);
          const patch: Partial<Prospect> = { stage };
          let n = s;
          if (stage === 'contactado' && !p.firstContact) {
            patch.firstContact = t;
            patch.lastContact = t;
            patch.sequenceStep = 0;
            patch.nextFollowUp = nextFromSequence(s, { ...p, firstContact: t }, 0);
            n = withActivity(n, 'outreach', { prospectId: id });
          }
          if (stage === 'respondio' && forward && !hasActivity(s, id, 'reply')) {
            n = withActivity(n, 'reply', { prospectId: id });
            patch.nextFollowUp = addDays(t, 1);
          }
          if (stage === 'reunion' && forward && !hasActivity(s, id, 'meeting')) {
            n = withActivity(n, 'meeting', { prospectId: id });
          }
          if (stage === 'propuesta' && forward && !hasActivity(s, id, 'proposal')) {
            n = withActivity(n, 'proposal', { prospectId: id });
            patch.lastContact = t;
            patch.nextFollowUp = addDays(t, 3);
          }
          if (stage === 'ganado') {
            const amount = opts.amount ?? (p.value || s.profile.avgPrice);
            patch.wonAt = t;
            patch.wonAmount = amount;
            patch.nextFollowUp = null;
            patch.probability = 100;
            n = withActivity(n, 'won', { prospectId: id, amount });
            setTimeout(() => bus.emit({ type: 'celebrate' }), 50);
          }
          if (stage === 'perdido') {
            patch.nextFollowUp = null;
            patch.lostReason = opts.reason ?? p.lostReason;
            n = withActivity(n, 'lost', { prospectId: id, note: opts.reason ?? '' });
          }
          if (p.stage === 'ganado' && stage !== 'ganado') {
            patch.wonAt = null;
            patch.wonAmount = null;
            patch.probability = null;
            // revertir la venta registrada para no inflar métricas
            const lastWon = [...n.activities].reverse().find((x) => x.prospectId === id && x.type === 'won');
            if (lastWon) n = { ...n, activities: n.activities.filter((x) => x.id !== lastWon.id) };
          }
          if (ACTIVE_STAGES.includes(stage) && !p.firstContact && !patch.firstContact) {
            patch.firstContact = t;
            patch.lastContact = patch.lastContact ?? t;
          }
          return touchProspect(n, id, patch);
        });
      },
      logTouch(id, channel, note = '') {
        commit((s) => {
          const p = s.prospects.find((x) => x.id === id);
          if (!p) return s;
          const t = today();
          const first = !p.firstContact;
          const patch: Partial<Prospect> = { lastContact: t };
          let n = s;
          if (first) {
            patch.firstContact = t;
            patch.sequenceStep = 0;
            if (p.stage === 'nuevo' || p.stage === 'investigando') patch.stage = 'contactado';
            patch.nextFollowUp = nextFromSequence(s, { ...p, firstContact: t }, 0);
            n = withActivity(n, 'outreach', { prospectId: id, channel, note });
          } else {
            const step = p.sequenceStep + 1;
            patch.sequenceStep = step;
            if (p.stage === 'contactado') {
              patch.nextFollowUp = nextFromSequence(s, p, step);
            } else if (p.stage !== 'ganado' && p.stage !== 'perdido') {
              patch.nextFollowUp = addDays(t, 3);
            }
            if (p.stage === 'nuevo' || p.stage === 'investigando') patch.stage = 'contactado';
            n = withActivity(n, 'followup', { prospectId: id, channel, note });
          }
          return touchProspect(n, id, patch);
        });
      },
      logReply(id, note = '') {
        commit((s) => {
          const p = s.prospects.find((x) => x.id === id);
          if (!p) return s;
          const t = today();
          let n = withActivity(s, 'reply', { prospectId: id, note });
          const patch: Partial<Prospect> = { lastContact: t, nextFollowUp: addDays(t, 1) };
          if (STAGES.indexOf(p.stage) < STAGES.indexOf('respondio')) patch.stage = 'respondio';
          if (!p.firstContact) patch.firstContact = t;
          n = touchProspect(n, id, patch);
          return n;
        });
      },
      setNextFollowUp(id, day) {
        commit((s) => touchProspect(s, id, { nextFollowUp: day }));
      },
      deleteActivity(id) {
        commit((s) => ({ ...s, activities: s.activities.filter((x) => x.id !== id) }));
      },
      undoProspectChange(snapshot, before) {
        commit((s) => ({
          ...s,
          prospects: s.prospects.map((p) => (p.id === snapshot.id ? snapshot : p)),
          activities: s.activities.filter((a) => before.has(a.id) || a.prospectId !== snapshot.id),
        }));
      },

      addItem(partial) {
        const item: AgendaItem = {
          id: uid(),
          kind: 'tarea',
          title: '',
          date: today(),
          time: null,
          duration: 30,
          prospectId: null,
          notes: '',
          priority: 'media',
          status: 'pendiente',
          doneAt: null,
          createdAt: new Date().toISOString(),
          ...partial,
        };
        commit((s) => ({ ...s, items: [...s.items, item] }));
        return item;
      },
      updateItem(id, patch) {
        commit((s) => ({ ...s, items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
      },
      deleteItem(id) {
        commit((s) => ({ ...s, items: s.items.filter((i) => i.id !== id) }));
      },
      toggleItem(id) {
        commit((s) => {
          const it = s.items.find((i) => i.id === id);
          if (!it) return s;
          const done = it.status !== 'hecho';
          let n: AppState = {
            ...s,
            items: s.items.map((i) => (i.id === id ? { ...i, status: done ? 'hecho' : 'pendiente', doneAt: done ? new Date().toISOString() : null } : i)),
          };
          if (!done) {
            // deshacer: quitar las actividades que generó al completarse
            n = { ...n, activities: n.activities.filter((a) => a.ref !== it.id) };
          }
          if (done) {
            const pid = it.prospectId;
            const p = pid ? s.prospects.find((x) => x.id === pid) : undefined;
            // Completar una llamada/seguimiento/reunión con cliente cuenta como trabajo comercial real
            if (p && (it.kind === 'llamada' || it.kind === 'seguimiento')) {
              const t = today();
              const first = !p.firstContact;
              n = withActivity(n, first ? 'outreach' : 'followup', { prospectId: p.id, channel: it.kind === 'llamada' ? 'llamada' : 'whatsapp', note: it.title, ref: it.id });
              n = touchProspect(n, p.id, {
                lastContact: t,
                firstContact: p.firstContact ?? t,
                stage: p.stage === 'nuevo' || p.stage === 'investigando' ? 'contactado' : p.stage,
                nextFollowUp: p.stage === 'ganado' || p.stage === 'perdido' ? null : addDays(t, 3),
              });
            } else if (p && (it.kind === 'reunion' || it.kind === 'demo') && !hasActivity(s, p.id, 'meeting')) {
              n = withActivity(n, 'meeting', { prospectId: p.id, note: it.title, ref: it.id });
              if (STAGES.indexOf(p.stage) < STAGES.indexOf('reunion')) n = touchProspect(n, p.id, { stage: 'reunion', lastContact: today() });
            } else {
              n = withActivity(n, 'task_done', { prospectId: pid, note: it.title, ref: it.id });
            }
          }
          return n;
        });
      },

      addResource(partial) {
        const now = new Date().toISOString();
        const r: Resource = { id: uid(), kind: 'nota', title: '', body: '', tags: [], favorite: false, createdAt: now, updatedAt: now, ...partial };
        commit((s) => ({ ...s, resources: [r, ...s.resources] }));
        return r;
      },
      addResources(list) {
        const now = new Date().toISOString();
        const rs = list.map((partial) => ({ id: uid(), kind: 'nota' as const, title: '', body: '', tags: [], favorite: false, createdAt: now, updatedAt: now, ...partial }));
        commit((s) => ({ ...s, resources: [...rs, ...s.resources] }));
      },
      updateResource(id, patch) {
        commit((s) => ({ ...s, resources: s.resources.map((r) => (r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r)) }));
      },
      deleteResource(id) {
        commit((s) => ({ ...s, resources: s.resources.filter((r) => r.id !== id) }));
      },

      saveAudit(rec, problems) {
        const full: AuditRecord = { ...rec, id: uid(), createdAt: new Date().toISOString() };
        commit((s) => {
          let n = withActivity({ ...s, audits: [full, ...s.audits] }, 'audit', { prospectId: rec.prospectId, note: rec.url });
          if (rec.prospectId) {
            const p = n.prospects.find((x) => x.id === rec.prospectId);
            if (p) {
              const merged = Array.from(new Set([...p.problems, ...problems]));
              const webStatus = rec.score >= 75 ? 'moderna' : rec.score >= 55 ? 'mejorable' : 'antigua';
              n = touchProspect(n, p.id, {
                problems: merged,
                auditScore: rec.score,
                webStatus,
                website: p.website || rec.url,
                stage: p.stage === 'nuevo' ? 'investigando' : p.stage,
              });
            }
          }
          return n;
        });
        return full;
      },
      completeTraining() {
        const t = today();
        if (ref.current.coach.trainingsDone[t]) return;
        commit((s) => withActivity({ ...s, coach: { ...s.coach, trainingsDone: { ...s.coach.trainingsDone, [t]: true } } }, 'training'));
      },
      saveRoleplay(r) {
        const full: RoleplayResult = { ...r, id: uid(), at: new Date().toISOString() };
        commit((s) => {
          const todayRoleplays = s.activities.filter((x) => x.type === 'training' && x.day === today()).length;
          const n = { ...s, coach: { ...s.coach, roleplays: [full, ...s.coach.roleplays].slice(0, 200) } };
          // máx. 3 entrenamientos con XP al día: el XP premia la práctica, no el spam
          return todayRoleplays < 3 ? withActivity(n, 'training', { note: r.scenario }) : n;
        });
      },

      markRead(ids) {
        commit((s) => ({ ...s, readNotifications: Array.from(new Set([...s.readNotifications, ...ids])).slice(-500) }));
      },
      replaceState(s) {
        commit(() => migrate(s));
      },
      resetAll() {
        storage.clear();
        commit(() => initialState());
      },
    };
    return a;
  }, [storage]);

  const value = useMemo(() => ({ state, loading, actions }), [state, loading, actions]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore fuera de StoreProvider');
  return v;
}
