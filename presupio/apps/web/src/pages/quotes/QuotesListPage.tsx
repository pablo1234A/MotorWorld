import { FilePlus2, FileText, Search, SearchX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuotes, type QuoteFilters } from '../../api/queries';
import type { Quote, QuoteStatus } from '../../api/types';
import { useSession } from '../../auth/session';
import { Button, buttonClass, EmptyState, ErrorAlert, PageHeader, Ref, SkeletonRows, StatusPill } from '../../components/ui';
import { daysSince, formatDate, formatDays, formatMoney } from '../../lib/format';
import { QUOTE_STATUS_SHORT } from '../../lib/labels';
import { usePageTitle } from '../../lib/usePageTitle';

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'sent', label: QUOTE_STATUS_SHORT.sent },
  { value: 'responded', label: QUOTE_STATUS_SHORT.responded },
  { value: 'accepted', label: QUOTE_STATUS_SHORT.accepted },
  { value: 'rejected', label: QUOTE_STATUS_SHORT.rejected },
  { value: 'draft', label: QUOTE_STATUS_SHORT.draft },
];

const VALID_STATUS = new Set<QuoteStatus>(['draft', 'sent', 'responded', 'accepted', 'rejected']);

function Waiting({ quote }: { quote: Quote }) {
  if (quote.status !== 'sent' || !quote.sentAt) return null;
  const days = daysSince(quote.sentAt);
  return <span className="cell-sub">{days === 0 ? 'Enviado hoy' : `${formatDays(days)} sin respuesta`}</span>;
}

export function QuotesListPage() {
  usePageTitle('Presupuestos');
  const session = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get('estado') ?? '')
    .split(',')
    .filter((s): s is QuoteStatus => VALID_STATUS.has(s as QuoteStatus))
    .join(',');
  const archivedParam = params.get('archivados');
  const archived: QuoteFilters['archived'] = archivedParam === 'si' ? 'true' : archivedParam === 'todos' ? 'all' : 'false';
  const q = params.get('q') ?? '';
  const [search, setSearch] = useState(q);

  // Búsqueda con espera breve para no lanzar una petición por cada tecla.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (search.trim() === q) return;
      const next = new URLSearchParams(params);
      if (search.trim()) next.set('q', search.trim());
      else next.delete('q');
      setParams(next, { replace: true });
    }, 300);
    return () => window.clearTimeout(t);
  }, [search, q, params, setParams]);

  const filters = useMemo<QuoteFilters>(() => ({ status: status || undefined, q: q || undefined, archived }), [status, q, archived]);
  const quotes = useQuotes(filters);
  const items = quotes.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = !!(status || q || archived !== 'false');

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <div className="page">
      <PageHeader
        title="Presupuestos"
        description="Todos los presupuestos registrados de tu empresa, del más reciente al más antiguo."
        actions={
          session.can('quotes:write') && (
            <Link to="/presupuestos/nuevo" className={buttonClass('primary')}>
              <FilePlus2 aria-hidden="true" /> Nuevo presupuesto
            </Link>
          )
        }
      />

      <section className="panel" aria-label="Listado de presupuestos">
        <div className="toolbar">
          <div className="toolbar__filters" role="group" aria-label="Filtrar por estado">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value || 'all'}
                type="button"
                className="filter-chip"
                aria-pressed={status === f.value}
                onClick={() => setParam('estado', f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="toolbar__search">
            <label className="visually-hidden" htmlFor="quote-search">
              Buscar presupuestos
            </label>
            <div className="input-affix input-affix--prefix">
              <span className="input-affix__prefix">
                <Search aria-hidden="true" />
              </span>
              <input
                id="quote-search"
                className="input"
                type="search"
                placeholder="Título, referencia o cliente"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <label className="visually-hidden" htmlFor="quote-archived">
              Mostrar archivados
            </label>
            <select
              id="quote-archived"
              className="select toolbar__select"
              value={archivedParam === 'si' ? 'si' : archivedParam === 'todos' ? 'todos' : ''}
              onChange={(e) => setParam('archivados', e.target.value)}
            >
              <option value="">Activos</option>
              <option value="si">Archivados</option>
              <option value="todos">Activos y archivados</option>
            </select>
          </div>
        </div>

        {quotes.isPending ? (
          <SkeletonRows rows={6} label="Cargando presupuestos…" />
        ) : quotes.isError ? (
          <div className="panel__body">
            <ErrorAlert error={quotes.error} title="No se han podido cargar los presupuestos" onRetry={() => void quotes.refetch()} />
          </div>
        ) : items.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={SearchX}
              title="Ningún presupuesto coincide con estos filtros"
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('');
                    setParams(new URLSearchParams(), { replace: true });
                  }}
                >
                  Quitar filtros
                </Button>
              }
            >
              Prueba con otro estado o con otra búsqueda.
            </EmptyState>
          ) : (
            <EmptyState
              icon={FileText}
              title="Todavía no hay presupuestos"
              action={
                session.can('quotes:write') && (
                  <Link to="/presupuestos/nuevo" className={buttonClass('primary')}>
                    <FilePlus2 aria-hidden="true" /> Registrar un presupuesto
                  </Link>
                )
              }
            >
              Registra los presupuestos que ya has enviado para ver cuáles siguen sin respuesta.
            </EmptyState>
          )
        ) : (
          <>
            <div className="table-wrap only-desktop" aria-busy={quotes.isFetching} tabIndex={0} role="region" aria-label="Tabla de presupuestos (desplazable)">
              <table className="table">
                <caption className="visually-hidden">Presupuestos</caption>
                <thead>
                  <tr>
                    <th scope="col">Presupuesto</th>
                    <th scope="col">Cliente</th>
                    <th scope="col" className="num">
                      Importe
                    </th>
                    <th scope="col">Enviado</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((quote) => (
                    <tr
                      key={quote.id}
                      className="is-link"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('a')) return;
                        navigate(`/presupuestos/${quote.id}`);
                      }}
                    >
                      <td style={{ maxWidth: '22rem' }}>
                        {quote.reference && <Ref>{quote.reference}</Ref>}
                        <Link to={`/presupuestos/${quote.id}`} className="row-link" style={{ display: 'block' }}>
                          {quote.title}
                        </Link>
                      </td>
                      <td>
                        {quote.contact.fullName}
                        {quote.contact.organization && <span className="cell-sub">{quote.contact.organization}</span>}
                      </td>
                      <td className="num">{formatMoney(quote.amountCents, quote.currency)}</td>
                      <td className="nowrap">
                        <span className="num">{formatDate(quote.sentAt)}</span>
                        <Waiting quote={quote} />
                      </td>
                      <td>
                        <StatusPill status={quote.status} archived={!!quote.archivedAt} />
                      </td>
                      <td className="muted">{quote.owner?.fullName ?? 'Sin asignar'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="rows only-mobile">
              {items.map((quote) => (
                <li key={quote.id}>
                  <Link to={`/presupuestos/${quote.id}`} className="row quote-card">
                    <div className="row__main">
                      {quote.reference && <Ref>{quote.reference}</Ref>}
                      <p className="row__title">{quote.title}</p>
                      <p className="row__meta">
                        <span>{quote.contact.fullName}</span>
                        <span className="num">{formatMoney(quote.amountCents, quote.currency)}</span>
                      </p>
                      <div className="cluster" style={{ marginTop: 'var(--s-2)' }}>
                        <StatusPill status={quote.status} archived={!!quote.archivedAt} />
                        <Waiting quote={quote} />
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        {quotes.hasNextPage && (
          <div className="panel__footer">
            <span className="small muted">{items.length} presupuestos cargados</span>
            <Button onClick={() => void quotes.fetchNextPage()} loading={quotes.isFetchingNextPage}>
              Cargar más
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
