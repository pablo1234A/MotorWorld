import { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Gauge, Loader2, Save, ScanSearch, Sparkles, RotateCcw, History } from 'lucide-react';
import { useStore } from '../data/store';
import { Field, Ring } from '../components/ui';
import type { AuditAnswer, PsiSummary } from '../data/types';
import { AUDIT_AREAS, AUDIT_CHECKS, answeredCount, answersFromPsi, auditFindings, auditScore, runPsi, salesPitch } from '../lib/audit';
import { clearQuery, navigate, useRoute } from '../lib/router';
import { cleanUrl, displayUrl } from '../lib/format';
import { fmtDay } from '../lib/dates';
import { toast } from '../lib/bus';

const LABELS: Record<AuditAnswer, string> = { ok: 'Bien', regular: 'Regular', mal: 'Mal', na: 'N/A' };

export default function Audit() {
  const { state, actions } = useStore();
  const route = useRoute();
  const [url, setUrl] = useState('');
  const [prospectId, setProspectId] = useState('');
  const [answers, setAnswers] = useState<Record<string, AuditAnswer>>({});
  const [psi, setPsi] = useState<PsiSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [psiError, setPsiError] = useState('');
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const id = route.query.get('prospect');
    if (id) {
      const p = state.prospects.find((x) => x.id === id);
      if (p) {
        setProspectId(p.id);
        setUrl(p.website);
        if (p.website) setStarted(true);
      }
      clearQuery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const p = state.prospects.find((x) => x.id === prospectId);
  const vars = { negocio: p?.business ?? (url ? displayUrl(url).split('/')[0] : ''), sector: p?.sector ?? state.profile.targetSectors[0] ?? '', ciudad: p?.city || state.profile.market };
  const score = auditScore(answers);
  const findings = useMemo(() => auditFindings(answers, vars), [answers, vars.negocio, vars.sector, vars.ciudad]); // eslint-disable-line react-hooks/exhaustive-deps
  const answered = answeredCount(answers);
  const total = AUDIT_CHECKS.length;
  const pitch = score != null ? salesPitch(findings, score, vars) : '';

  const analyze = async () => {
    if (!url.trim()) return toast('Introduce una URL', 'warn');
    setStarted(true);
    setLoading(true);
    setPsiError('');
    try {
      const r = await runPsi(cleanUrl(url), state.settings.psiKey || undefined);
      setPsi(r);
      setAnswers((a) => ({ ...answersFromPsi(r, cleanUrl(url)), ...a }));
      toast('Análisis técnico completado');
    } catch (e) {
      setPsiError((e as Error).name === 'AbortError' ? 'El análisis tardó demasiado.' : (e as Error).message || 'No se pudo analizar');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setAnswers({});
    setPsi(null);
    setPsiError('');
    setStarted(false);
    setUrl('');
    setProspectId('');
  };

  const save = () => {
    if (score == null) return;
    const ids = findings.map((f) => f.problem);
    actions.saveAudit({ url: cleanUrl(url), prospectId: prospectId || null, answers, score, psi }, ids);
    toast(p ? `Auditoría guardada en la ficha de ${p.business}` : 'Auditoría guardada');
    if (p) navigate(`#/prospects/${p.id}`);
  };

  const scoreColor = score == null ? 'var(--text-3)' : score >= 75 ? 'var(--green)' : score >= 50 ? 'var(--orange)' : 'var(--red)';

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">Auditoría web comercial</h1>
          <p className="muted">Convierte los fallos de una web en argumentos de venta que el dueño entiende.</p>
        </div>
        {started && (
          <button className="btn btn-ghost" onClick={reset}>
            <RotateCcw /> Nueva auditoría
          </button>
        )}
      </div>

      <div className="card">
        <form
          className="grid"
          style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) auto', alignItems: 'end' }}
          data-stack
          onSubmit={(e) => {
            e.preventDefault();
            analyze();
          }}
        >
          <Field label="URL de la web">
            <input className="input input-lg" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="www.negocio.com" inputMode="url" />
          </Field>
          <Field label="Prospecto (opcional)">
            <select
              className="select"
              style={{ height: 52 }}
              value={prospectId}
              onChange={(e) => {
                setProspectId(e.target.value);
                const pp = state.prospects.find((x) => x.id === e.target.value);
                if (pp?.website && !url) setUrl(pp.website);
              }}
            >
              <option value="">Sin vincular</option>
              {state.prospects
                .filter((x) => x.stage !== 'ganado' && x.stage !== 'perdido')
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.business}
                  </option>
                ))}
            </select>
          </Field>
          <div className="row gap-6">
            <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
              {loading ? <Loader2 className="spin" /> : <ScanSearch />} Analizar
            </button>
            {!started && (
              <button type="button" className="btn btn-lg btn-ghost" onClick={() => setStarted(true)} data-tip="Sin análisis técnico automático">
                Manual
              </button>
            )}
          </div>
        </form>
        {url && (
          <a className="small muted row gap-6 mt-12" href={cleanUrl(url)} target="_blank" rel="noreferrer" style={{ display: 'inline-flex' }}>
            Abrir {displayUrl(url)} en otra pestaña para revisarla <ExternalLink size={13} />
          </a>
        )}
      </div>

      {!started && state.audits.length > 0 && (
        <div className="card mt-16">
          <div className="card-head">
            <div className="h3">
              <History /> Auditorías anteriores
            </div>
          </div>
          <div className="list">
            {state.audits.slice(0, 8).map((a) => {
              const ap = state.prospects.find((x) => x.id === a.prospectId);
              return (
                <div
                  key={a.id}
                  className="list-row clickable"
                  onClick={() => {
                    setUrl(a.url);
                    setProspectId(a.prospectId ?? '');
                    setAnswers(a.answers);
                    setPsi(a.psi);
                    setStarted(true);
                  }}
                >
                  <span className="mono strong" style={{ width: 36, color: a.score >= 75 ? 'var(--green)' : a.score >= 50 ? 'var(--orange)' : 'var(--red)' }}>
                    {a.score}
                  </span>
                  <div className="grow">
                    <div className="trunc">{ap?.business ?? displayUrl(a.url)}</div>
                    <div className="tiny dim">{displayUrl(a.url)}</div>
                  </div>
                  <span className="tiny dim">{fmtDay(a.createdAt.slice(0, 10))}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {started && (
        <div className="grid mt-16" style={{ gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)' }} data-stack>
          {/* Checklist */}
          <div className="col gap-16">
            {loading && (
              <div className="card row gap-12">
                <Loader2 className="spin" size={18} />
                <div>
                  <div className="small strong">Analizando velocidad, SEO y móvil con Google PageSpeed…</div>
                  <div className="tiny dim">Puede tardar hasta 30 segundos. Mientras, revisa la web y responde el checklist.</div>
                </div>
              </div>
            )}
            {psiError && (
              <div className="card tight small" style={{ borderColor: 'color-mix(in srgb, var(--orange) 40%, transparent)' }}>
                <span style={{ color: 'var(--orange)' }}>No se pudo hacer el análisis automático:</span> <span className="muted">{psiError}</span>
                <div className="tiny dim mt-4">Puedes completar el checklist manualmente. Si se repite, añade una clave gratuita de PageSpeed en Ajustes.</div>
              </div>
            )}
            {psi && (
              <div className="card">
                <div className="card-head">
                  <div className="h3">
                    <Gauge /> Análisis técnico (móvil)
                  </div>
                  <span className="tiny dim">Google PageSpeed</span>
                </div>
                <div className="grid g4 keep">
                  {[
                    ['Rendimiento', psi.performance],
                    ['SEO', psi.seo],
                    ['Accesibilidad', psi.accessibility],
                    ['Buenas prácticas', psi.bestPractices],
                  ].map(([l, v]) => (
                    <div key={l as string} className="col gap-6" style={{ alignItems: 'center', textAlign: 'center' }}>
                      <Ring value={(v as number) ?? 0} size={64} stroke={6} color={v == null ? 'var(--text-4)' : (v as number) >= 90 ? 'var(--green)' : (v as number) >= 50 ? 'var(--orange)' : 'var(--red)'}>
                        <span className="small strong num">{v ?? '—'}</span>
                      </Ring>
                      <span className="tiny dim">{l}</span>
                    </div>
                  ))}
                </div>
                {(psi.lcp || psi.cls) && (
                  <div className="tiny dim mt-16">
                    {psi.lcp && <>Carga del contenido principal: <b className="strong">{psi.lcp}</b> · </>}
                    {psi.cls && <>Estabilidad visual (CLS): <b className="strong">{psi.cls}</b></>}
                  </div>
                )}
              </div>
            )}
            <div className="card">
              <div className="card-head">
                <div className="h3">Checklist comercial</div>
                <span className="row gap-6">
                  {score != null && (
                    <span className="badge num" style={{ color: scoreColor }}>
                      {score}/100
                    </span>
                  )}
                  <span className="tiny dim num">
                    {answered}/{total}
                  </span>
                </span>
              </div>
              {AUDIT_AREAS.map((area) => (
                <div key={area} className="mb-16">
                  <div className="eyebrow mb-8">{area}</div>
                  {AUDIT_CHECKS.filter((c) => c.area === area).map((c) => (
                    <div key={c.id} className="audit-q">
                      <div>
                        <div className="small">{c.question}</div>
                        <div className="tiny dim">{c.hint}</div>
                      </div>
                      <div className="tri">
                        {(['ok', 'regular', 'mal', 'na'] as AuditAnswer[]).map((v) => (
                          <button key={v} className={`${v} ${answers[c.id] === v ? 'on' : ''}`} onClick={() => setAnswers((a) => ({ ...a, [c.id]: v }))}>
                            {LABELS[v]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Resultado */}
          <div className="col gap-16" style={{ alignSelf: 'start' }}>
            <div className="card glow" style={{ textAlign: 'center' }}>
              <div className="eyebrow">Web score</div>
              {score == null ? (
                <div className="col gap-6 mt-16" style={{ alignItems: 'center' }}>
                  <div className="score-big dim">—</div>
                  <div className="small dim">Responde el checklist o usa el análisis automático.</div>
                </div>
              ) : (
                <>
                  <div className="score-big mt-12" style={{ color: scoreColor }}>
                    {score}
                    <small>/100</small>
                  </div>
                  <div className="small muted mt-8">{score >= 75 ? 'Web sólida: vende crecimiento, no arreglos.' : score >= 50 ? 'Web mejorable: buena oportunidad de venta.' : 'Web con problemas graves: oportunidad clara.'}</div>
                  {answered < total * 0.5 && <div className="tiny dim mt-8">Basado en {answered} de {total} puntos. Completa más para afinar.</div>}
                </>
              )}
            </div>

            {score != null && (
              <>
                <div className="card">
                  <div className="h3 mb-12">{Math.min(5, findings.length) || 'Sin'} problemas que están haciendo perder clientes</div>
                  {findings.length === 0 ? (
                    <p className="small muted">No has marcado problemas.</p>
                  ) : (
                    findings.slice(0, 5).map((f, i) => (
                      <div key={f.problem} className="finding">
                        <span className="n">{i + 1}</span>
                        <div className="grow">
                          <div className="row gap-6">
                            <span className="strong small">{f.label}</span>
                            <span className={`badge ${f.severity === 'crítico' ? 'hot' : f.severity === 'alto' ? 'warm' : 'cold'}`}>{f.severity}</span>
                          </div>
                          <p className="small muted mt-4">{f.argument}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {findings.length > 0 && (
                  <div className="card">
                    <div className="h3 mb-12">Oportunidades de mejora</div>
                    <ul className="col gap-6" style={{ listStyle: 'none' }}>
                      {findings.map((f) => (
                        <li key={f.problem} className="row row-top gap-6 small">
                          <Sparkles size={14} style={{ color: 'var(--accent)', flex: 'none', marginTop: 3 }} />
                          {f.fix}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="card">
                  <div className="card-head">
                    <div className="h3">Argumento de venta</div>
                    <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(pitch).then(() => toast('Copiado'))}>
                      <Copy /> Copiar
                    </button>
                  </div>
                  <p className="prewrap small" style={{ lineHeight: 1.65 }}>
                    {pitch}
                  </p>
                  <div className="tiny dim mt-12">Para usar en la llamada. Léelo en voz alta una vez antes de marcar.</div>
                </div>

                <button className="btn btn-primary btn-lg" onClick={save}>
                  <Save /> {p ? `Guardar en ${p.business}` : 'Guardar auditoría'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
