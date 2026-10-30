import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { createQueryClient } from '../src/api/queries';
import type { Me } from '../src/api/types';
import { ToastProvider } from '../src/components/Toasts';
import { routes } from '../src/router';

export interface MockResponse {
  status?: number;
  body?: unknown;
}
type Handler = (body: unknown, url: URL) => MockResponse | Promise<MockResponse>;

/**
 * Sustituye fetch por un servidor simulado con rutas "MÉTODO /ruta". Las peticiones
 * no previstas fallan la prueba con 599 para detectar llamadas inesperadas.
 */
export function mockApi(handlers: Record<string, Handler>) {
  const calls: Array<{ method: string; path: string; body: unknown; credentials?: RequestCredentials }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body, credentials: init?.credentials });
    const handler = handlers[`${method} ${path}`];
    const res = handler ? await handler(body, url) : { status: 599, body: { error: { code: 'UNMOCKED', message: `${method} ${path} sin simular` } } };
    const status = res.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(res.body ?? {}), {
      status,
      headers: { 'content-type': 'application/json', 'x-request-id': 'req-test' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

export const unauthenticated = {
  'GET /me': () => ({ status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'Necesitas iniciar sesión.' } } }),
  'GET /public/legal': () => ({ body: { legal: { termsUrl: null, privacyUrl: null, published: false } } }),
};

export function fakeMe(overrides: Partial<Me> = {}): Me {
  return {
    user: { id: '11111111-1111-4111-8111-111111111111', email: 'ana@ejemplo.test', fullName: 'Ana Prueba', emailVerified: true },
    company: { id: '22222222-2222-4222-8222-222222222222', name: 'Reformas Prueba SL' },
    role: 'owner',
    permissions: [
      'company:read',
      'company:update',
      'settings:update',
      'subscription:read',
      'members:read',
      'members:manage',
      'quotes:read',
      'quotes:write',
      'quotes:reopen',
      'contacts:read',
      'contacts:write',
      'follow_ups:write',
      'exclusions:create',
      'exclusions:lift',
      'activity:read',
    ],
    memberships: [{ companyId: '22222222-2222-4222-8222-222222222222', companyName: 'Reformas Prueba SL', role: 'owner' }],
    subscription: { plan: 'starter', status: 'trialing', trialEndsAt: '2099-01-01T00:00:00Z', currentPeriodEnd: null, hasActiveAccess: true },
    ...overrides,
  };
}

/** Renderiza la aplicación completa (rutas reales) en una URL inicial. */
export function renderApp(initialPath: string) {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false, refetchOnWindowFocus: false } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...utils, router, queryClient };
}

export const emptySummary = {
  summary: {
    byStatus: { draft: 0, sent: 0, responded: 0, accepted: 0, rejected: 0 },
    responded: 0,
    reactivated: 0,
    recoveredSales: 0,
    recoveredAmountCents: 0,
    recoveredAmountSource: 'declared_by_company',
    followUps: { pending: 0, overdue: 0, completed: 0, failed: 0, awaitingApproval: 0 },
  },
};
