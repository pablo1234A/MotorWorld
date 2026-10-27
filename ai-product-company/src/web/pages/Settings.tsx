import { useEffect, useState } from 'react';
import { Check, Minus, Save, Trash2 } from 'lucide-react';
import { isBrowserEdition } from '../lib/transport';
import { api } from '../lib/api';
import { useResource } from '../lib/live';
import type { Integration, Settings } from '../lib/types';
import { Field, Loading, PageHead, Panel, Status, Tabs, useAction } from '../components/ui';

const CAT: Record<string, string> = {
  llm: 'Cerebro (LLM)', video_generation: 'Generación de vídeo', render: 'Edición / render', voice: 'Voz', music: 'Música y SFX', store: 'Tienda', analytics: 'Analytics', storage: 'Almacenamiento', publishing: 'Publicación',
};

function Integrations() {
  const { data } = useResource<Integration[]>('/api/integrations', { live: false });
  const { busy, run } = useAction();
  if (!data) return <Loading />;
  const cats = [...new Set(data.map((i) => i.category))];
  return (
    <div className="stack gap-16">
      <p className="muted small" style={{ maxWidth: '80ch' }}>
        Cada integración es un adaptador independiente. Las ranuras marcadas INTEGRATION_REQUIRED existen en la arquitectura pero no tienen implementación ni credenciales: la empresa sigue funcionando con los motores integrados y nunca finge que un servicio externo está conectado. Las credenciales se configuran solo como variables de entorno del servidor.
      </p>
      {cats.map((c) => (
        <Panel key={c} title={CAT[c] ?? c} flush>
          <div className="table-wrap">
          <table className="table" style={{ minWidth: 640 }}>
            <tbody>
              {data.filter((i) => i.category === c).map((i) => (
                <tr key={i.id}>
                  <td style={{ width: 260 }}>
                    <b style={{ fontWeight: 600 }}>{i.name}</b>
                    <div className="xs faint">{i.kind === 'builtin' ? 'motor integrado' : 'servicio externo'}{i.active ? ' · en uso' : ''}</div>
                  </td>
                  <td className="small muted">
                    {i.description}
                    {i.notes.map((n) => <div key={n} className="xs faint" style={{ marginTop: 3 }}>{n}</div>)}
                    {i.requiredEnv.length > 0 && <div className="chips" style={{ marginTop: 6 }}>{i.requiredEnv.map((e) => <span key={e} className="chip">{e}</span>)}</div>}
                  </td>
                  <td style={{ textAlign: 'right', width: 200 }}>
                    <div className="stack gap-6" style={{ alignItems: 'flex-end' }}>
                      <Status value={i.status} />
                      {i.id === 'shopify' && i.status === 'CONNECTED' && (
                        <button className="btn sm" disabled={busy} onClick={() => run(async () => { const r = await api.post<{ shopName: string }>('/api/integrations/shopify/test'); return r; }, 'Conexión con Shopify verificada')}>Probar conexión</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function SettingsForm() {
  const { data } = useResource<{ settings: Settings; llm: { engine: string; callsToday: number } }>('/api/settings', { live: false });
  const [s, setS] = useState<Settings | null>(null);
  const { busy, run } = useAction();
  useEffect(() => {
    if (data) setS(data.settings);
  }, [data]);
  if (!s || !data) return <Loading />;
  const num = (k: keyof Settings, label: string, hint: string, min: number, max: number) => (
    <Field label={label} hint={hint}>
      <input className="input" type="number" min={min} max={max} value={s[k] as number} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} />
    </Field>
  );
  return (
    <Panel>
      <div className="stack gap-16">
        <label className="check" style={{ fontSize: 14 }}>
          <input type="checkbox" checked={s.autopilot} onChange={(e) => setS({ ...s, autopilot: e.target.checked })} />
          <span><b>Autopilot</b> — ATLAS revisa la empresa periódicamente y crea objetivos por su cuenta (con el producto activo).</span>
        </label>
        <div className="grid-3">
          {num('autopilotIntervalMinutes', 'Intervalo del autopilot (min)', '15–1440', 15, 1440)}
          {num('maxRevisionCycles', 'Máximo de ciclos de revisión', 'Evita bucles infinitos LUNA ↔ equipo', 0, 10)}
          {num('qaApprovalThreshold', 'Umbral de aprobación QA', 'Score mínimo de LUNA (0–100)', 0, 100)}
          {num('maxTaskAttempts', 'Reintentos por tarea', 'Antes de escalar a ATLAS', 1, 10)}
          {num('maxConcurrentTasks', 'Tareas en paralelo', 'Una por agente como máximo', 1, 10)}
          {num('dailyReportHour', 'Hora del informe diario', 'Hora local del servidor (0–23)', 0, 23)}
          {num('maxLlmCallsPerDay', 'Límite diario de llamadas al LLM', `Control de coste · hoy: ${data.llm.callsToday}`, 1, 100000)}
          {num('defaultVideosPerObjective', 'Vídeos por objetivo', 'Por defecto en objetivos de vídeo', 1, 5)}
          <Field label="Idioma de trabajo de los agentes">
            <select className="select" value={s.language} onChange={(e) => setS({ ...s, language: e.target.value as 'es' | 'en' })}>
              <option value="es">Español</option><option value="en">English</option>
            </select>
          </Field>
        </div>
        <div className="row gap-8 wrap">
          {isBrowserEdition() && (
            <button
              className="btn danger"
              disabled={busy}
              onClick={() => window.confirm('¿Borrar TODOS los datos de la empresa guardados en este navegador (productos, vídeos, tareas, memoria)? Es irreversible.') && run(() => api.post('/api/system/reset'))}
            >
              <Trash2 /> Borrar datos de este navegador
            </button>
          )}
          <span className="spacer" />
          <button className="btn primary" disabled={busy} onClick={() => run(() => api.put('/api/settings', s), 'Ajustes guardados')}><Save /> Guardar ajustes</button>
        </div>
      </div>
    </Panel>
  );
}

function PermissionsMatrix() {
  const { data } = useResource<{ actions: string[]; resources: string[]; critical: { action: string; resource: string; reason: string }[]; agents: { id: string; grants: string[] }[] }>('/api/permissions', { live: false });
  if (!data) return <Loading />;
  return (
    <div className="stack gap-16">
      <Panel title="Acciones críticas — siempre requieren tu aprobación">
        <div className="stack gap-6 small">{data.critical.map((c) => <div key={`${c.action}${c.resource}`}><span className="chip">{c.action}:{c.resource}</span> <span className="muted">{c.reason}</span></div>)}</div>
      </Panel>
      {data.actions.map((action) => (
        <Panel key={action} title={action} flush>
          <div className="table-wrap">
            <table className="table matrix">
              <thead><tr><th>Recurso</th>{data.agents.map((a) => <th key={a.id}>{a.id}</th>)}</tr></thead>
              <tbody>
                {data.resources.map((r) => {
                  const any = data.agents.some((a) => a.grants.includes(`${action}:${r}`));
                  if (!any) return null;
                  return (
                    <tr key={r}>
                      <td className="mono small">{r}</td>
                      {data.agents.map((a) => <td key={a.id}>{a.grants.includes(`${action}:${r}`) ? <Check size={14} className="yes" aria-label="sí" /> : <Minus size={12} className="faint" aria-label="no" />}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!data.resources.some((r) => data.agents.some((a) => a.grants.includes(`${action}:${r}`))) && <p className="muted small" style={{ padding: 16 }}>Ningún agente tiene este permiso.</p>}
        </Panel>
      ))}
    </div>
  );
}

export function SettingsPage() {
  const [tab, setTab] = useState<'integrations' | 'settings' | 'permissions'>('integrations');
  return (
    <>
      <PageHead title="Integraciones y ajustes" sub="Conectores, reglas de operación de la empresa y matriz de permisos de los agentes." />
      <Tabs value={tab} onChange={setTab} items={[{ id: 'integrations', label: 'Integraciones' }, { id: 'settings', label: 'Operación' }, { id: 'permissions', label: 'Permisos' }]} />
      {tab === 'integrations' && <Integrations />}
      {tab === 'settings' && <SettingsForm />}
      {tab === 'permissions' && <PermissionsMatrix />}
    </>
  );
}
