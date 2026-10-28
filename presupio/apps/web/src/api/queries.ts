import { keepPreviousData, QueryCache, MutationCache, QueryClient, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, ApiError, isApiError, qs } from './client';
import type {
  ActivityEntry,
  Company,
  CompanySettings,
  ContactDetail,
  Contact,
  Exclusion,
  FollowUp,
  Invitation,
  Me,
  Member,
  Page,
  QuoteDetail,
  Quote,
  QuoteSummary,
  SubscriptionInfo,
} from './types';

export const keys = {
  me: ['me'] as const,
  summary: ['quotes', 'summary'] as const,
  quotes: (filters: object) => ['quotes', 'list', filters] as const,
  pendingQuotes: ['quotes', 'pending-map'] as const,
  quote: (id: string) => ['quotes', 'detail', id] as const,
  quoteActivity: (id: string) => ['quotes', 'detail', id, 'activity'] as const,
  quoteFollowUps: (id: string) => ['quotes', 'detail', id, 'follow-ups'] as const,
  followUps: (filters: object) => ['follow-ups', filters] as const,
  contacts: (filters: object) => ['contacts', 'list', filters] as const,
  contact: (id: string) => ['contacts', 'detail', id] as const,
  exclusions: (status: string) => ['exclusions', status] as const,
  activity: ['activity'] as const,
  company: ['company'] as const,
  settings: ['company', 'settings'] as const,
  subscription: ['company', 'subscription'] as const,
  members: ['members'] as const,
  invitations: ['members', 'invitations'] as const,
};

export function createQueryClient(): QueryClient {
  // Si cualquier petición recibe 401, la sesión ya no es válida: se marca como cerrada y
  // las rutas privadas redirigen al inicio de sesión.
  const onError = (error: unknown) => {
    if (isApiError(error, 401)) client.setQueryData(keys.me, null);
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (count, error) => !(error instanceof ApiError && error.status > 0 && error.status < 500) && count < 2,
      },
      mutations: { retry: false },
    },
  });
  return client;
}

// ---------------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------------

export function fetchMe(): Promise<Me | null> {
  return api<Me>('/me').catch((error: unknown) => {
    if (isApiError(error, 401)) return null;
    throw error;
  });
}

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: fetchMe, staleTime: 60_000 });
}

// ---------------------------------------------------------------------------
// Presupuestos
// ---------------------------------------------------------------------------

export interface QuoteFilters {
  status?: string;
  q?: string;
  archived?: 'false' | 'true' | 'all';
  ownerUserId?: string;
}

export function useQuotes(filters: QuoteFilters) {
  return useInfiniteQuery({
    queryKey: keys.quotes(filters),
    queryFn: ({ pageParam, signal }) =>
      api<Page<Quote>>(`/quotes${qs({ ...filters, limit: 25, cursor: pageParam })}`, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

/** Presupuestos enviados sin respuesta (para el plano de cartera). Máximo 100, el límite de la API. */
export function usePendingQuotes() {
  return useQuery({
    queryKey: keys.pendingQuotes,
    queryFn: ({ signal }) => api<Page<Quote>>(`/quotes${qs({ status: 'sent', limit: 100 })}`, { signal }),
  });
}

export function useSummary() {
  return useQuery({ queryKey: keys.summary, queryFn: ({ signal }) => api<{ summary: QuoteSummary }>('/quotes/summary', { signal }) });
}

export function useQuote(id: string) {
  return useQuery({ queryKey: keys.quote(id), queryFn: ({ signal }) => api<QuoteDetail>(`/quotes/${id}`, { signal }) });
}

export function useQuoteActivity(id: string) {
  return useInfiniteQuery({
    queryKey: keys.quoteActivity(id),
    queryFn: ({ pageParam, signal }) => api<Page<ActivityEntry>>(`/quotes/${id}/activity${qs({ limit: 20, cursor: pageParam })}`, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useQuoteFollowUps(id: string) {
  return useQuery({
    queryKey: keys.quoteFollowUps(id),
    queryFn: ({ signal }) => api<{ items: FollowUp[] }>(`/quotes/${id}/follow-ups`, { signal }),
  });
}

// ---------------------------------------------------------------------------
// Seguimientos
// ---------------------------------------------------------------------------

export interface FollowUpFilters {
  status: 'pending' | 'completed' | 'cancelled' | 'all';
  assignedTo?: 'me';
}

export function useFollowUps(filters: FollowUpFilters) {
  return useInfiniteQuery({
    queryKey: keys.followUps(filters),
    queryFn: ({ pageParam, signal }) => api<Page<FollowUp>>(`/follow-ups${qs({ ...filters, limit: 25, cursor: pageParam })}`, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

// ---------------------------------------------------------------------------
// Contactos y exclusiones
// ---------------------------------------------------------------------------

export function useContacts(q: string) {
  return useInfiniteQuery({
    queryKey: keys.contacts({ q }),
    queryFn: ({ pageParam, signal }) => api<Page<Contact>>(`/contacts${qs({ q, limit: 25, cursor: pageParam })}`, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useContact(id: string | undefined) {
  return useQuery({
    queryKey: keys.contact(id ?? ''),
    queryFn: ({ signal }) => api<ContactDetail>(`/contacts/${id}`, { signal }),
    enabled: !!id,
  });
}

export function useExclusions(status: 'active' | 'lifted' | 'all') {
  return useQuery({
    queryKey: keys.exclusions(status),
    queryFn: ({ signal }) => api<Page<Exclusion>>(`/exclusions${qs({ status, limit: 100 })}`, { signal }),
  });
}

// ---------------------------------------------------------------------------
// Actividad, empresa y equipo
// ---------------------------------------------------------------------------

export function useRecentActivity() {
  return useQuery({
    queryKey: keys.activity,
    queryFn: ({ signal }) => api<Page<ActivityEntry>>(`/activity${qs({ limit: 30 })}`, { signal }),
  });
}

export function useCompany() {
  return useQuery({ queryKey: keys.company, queryFn: ({ signal }) => api<{ company: Company }>('/company', { signal }) });
}

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: ({ signal }) => api<{ settings: CompanySettings }>('/company/settings', { signal }) });
}

export function useSubscription() {
  return useQuery({ queryKey: keys.subscription, queryFn: ({ signal }) => api<SubscriptionInfo>('/company/subscription', { signal }) });
}

export function useMembers() {
  return useQuery({ queryKey: keys.members, queryFn: ({ signal }) => api<{ items: Member[] }>('/members', { signal }) });
}

export function useInvitations(enabled: boolean) {
  return useQuery({
    queryKey: keys.invitations,
    queryFn: ({ signal }) => api<{ items: Invitation[] }>('/members/invitations', { signal }),
    enabled,
  });
}
