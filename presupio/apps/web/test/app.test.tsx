import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { emptySummary, fakeMe, mockApi, renderApp, unauthenticated } from './helpers';

const loggedInBasics = (me = fakeMe()) => ({
  'GET /me': () => ({ body: me }),
  'GET /quotes/summary': () => ({ body: emptySummary }),
  'GET /follow-ups': () => ({ body: { items: [], nextCursor: null } }),
  'GET /activity': () => ({ body: { items: [], nextCursor: null } }),
  'GET /quotes': () => ({ body: { items: [], nextCursor: null } }),
  'GET /company/settings': () => ({
    body: {
      settings: {
        firstFollowUpAfterDays: 3,
        followUpIntervalDays: 4,
        maxFollowUps: 3,
        allowedWeekdays: [1, 2, 3, 4, 5],
        contactWindowStart: '09:00',
        contactWindowEnd: '19:00',
        defaultChannel: 'email',
        requireManualApproval: true,
        legalBasisNote: null,
        updatedAt: '2026-10-28T10:00:00Z',
      },
    },
  }),
});

describe('rutas privadas', () => {
  it.each(['/', '/presupuestos', '/presupuestos/nuevo', '/seguimientos', '/contactos', '/configuracion/equipo', '/ruta-inventada'])(
    '%s sin sesión redirige a iniciar sesión conservando el destino',
    async (path) => {
      mockApi(unauthenticated);
      const { router } = renderApp(path);
      expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/iniciar-sesion');
      const next = new URLSearchParams(router.state.location.search).get('siguiente');
      expect(next).toBe(path === '/' ? null : path);
    },
  );

  it('si la sesión caduca durante el uso (401), vuelve al inicio de sesión', async () => {
    let expired = false;
    mockApi({
      ...loggedInBasics(),
      'GET /me': () => (expired ? unauthenticated['GET /me']() : { body: fakeMe() }),
      'GET /quotes': () => {
        expired = true;
        return { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'Necesitas iniciar sesión.' } } };
      },
    });
    const { router } = renderApp('/presupuestos');
    await waitFor(() => expect(router.state.location.pathname).toBe('/iniciar-sesion'));
  });

  it('con sesión, las pantallas de acceso redirigen a la aplicación', async () => {
    mockApi(loggedInBasics());
    const { router } = renderApp('/iniciar-sesion');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
  });

  it('un error del servidor al comprobar la sesión se muestra con opción de reintentar (no se finge sesión)', async () => {
    mockApi({ 'GET /me': () => ({ status: 503, body: { error: { code: 'INTERNAL_ERROR', message: 'Servicio no disponible.' } } }) });
    renderApp('/');
    expect(await screen.findByText('No se ha podido comprobar tu sesión')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('inicio de sesión', () => {
  it('valida en el navegador antes de enviar y no llama a la API', async () => {
    const { calls } = mockApi(unauthenticated);
    renderApp('/iniciar-sesion');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByText('Introduce tu email')).toBeInTheDocument();
    expect(screen.getByText('Introduce tu contraseña')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(calls.some((c) => c.path === '/auth/login')).toBe(false);
  });

  it('credenciales incorrectas: mensaje del servidor y contraseña vaciada', async () => {
    mockApi({
      ...unauthenticated,
      'POST /auth/login': () => ({ status: 401, body: { error: { code: 'INVALID_CREDENTIALS', message: 'Email o contraseña incorrectos.' } } }),
    });
    renderApp('/iniciar-sesion');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), 'ana@ejemplo.test');
    await user.type(screen.getByLabelText('Contraseña'), 'incorrecta-123');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByText('Email o contraseña incorrectos.')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
  });

  it('inicio correcto: va al destino solicitado', async () => {
    let logged = false;
    const { calls } = mockApi({
      ...loggedInBasics(),
      'GET /me': () => (logged ? { body: fakeMe() } : unauthenticated['GET /me']()),
      'POST /auth/login': () => {
        logged = true;
        return { body: { user: fakeMe().user, company: fakeMe().company, role: 'owner', memberships: [] } };
      },
    });
    const { router } = renderApp('/iniciar-sesion?siguiente=%2Fpresupuestos%3Festado%3Dsent');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), '  ana@ejemplo.test ');
    await user.type(screen.getByLabelText('Contraseña'), 'contraseña-correcta');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/presupuestos'));
    expect(router.state.location.search).toBe('?estado=sent');
    expect(calls.find((c) => c.path === '/auth/login')?.body).toEqual({ email: 'ana@ejemplo.test', password: 'contraseña-correcta' });
  });

  it('no permite redirecciones a otros dominios', async () => {
    let logged = false;
    mockApi({
      ...loggedInBasics(),
      'GET /me': () => (logged ? { body: fakeMe() } : unauthenticated['GET /me']()),
      'POST /auth/login': () => {
        logged = true;
        return { body: {} };
      },
    });
    const { router } = renderApp('/iniciar-sesion?siguiente=%2F%2Fatacante.example%2Frobar');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), 'ana@ejemplo.test');
    await user.type(screen.getByLabelText('Contraseña'), 'contraseña-correcta');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});

describe('registro', () => {
  it('exige aceptar los términos y muestra los errores de campo del servidor', async () => {
    const { calls } = mockApi({
      ...unauthenticated,
      'POST /auth/register': () => ({
        status: 409,
        body: { error: { code: 'CONFLICT', message: 'Ya existe una cuenta con este email. Inicia sesión o recupera tu contraseña.' } },
      }),
    });
    renderApp('/registro');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Tu nombre y apellidos'), 'Ana Prueba');
    await user.type(screen.getByLabelText('Nombre de la empresa'), 'Reformas Ana');
    await user.type(screen.getByLabelText('Email de trabajo'), 'ana@ejemplo.test');
    await user.type(screen.getByLabelText('Contraseña'), 'una-frase-larga');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByText('Debes aceptar los términos para crear la cuenta')).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/auth/register')).toBe(false);

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByText(/Ya existe una cuenta con este email/)).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/auth/register')?.body).toMatchObject({ acceptTerms: true, email: 'ana@ejemplo.test' });
  });
});

describe('panel', () => {
  it('sin datos no inventa cifras: muestra ceros reales y cómo empezar', async () => {
    mockApi(loggedInBasics());
    renderApp('/');
    expect(await screen.findByText('Empieza en tres pasos')).toBeInTheDocument();
    const ledger = screen.getByText('Estado de la cartera').closest('section')!;
    await waitFor(() => expect(within(ledger).getAllByText('0')).toHaveLength(5));
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('si el resumen falla, se muestra el error en lugar de cifras', async () => {
    mockApi({
      ...loggedInBasics(),
      'GET /quotes/summary': () => ({ status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Error interno. Inténtalo de nuevo.', requestId: 'abc-123' } } }),
    });
    renderApp('/');
    expect(await screen.findByText('No se ha podido cargar el estado de la cartera')).toBeInTheDocument();
    expect(screen.getByText(/abc-123/)).toBeInTheDocument();
  });

  it('un lector (viewer) no ve acciones de escritura', async () => {
    mockApi(loggedInBasics(fakeMe({ role: 'viewer', permissions: ['quotes:read', 'company:read', 'activity:read', 'members:read', 'contacts:read', 'subscription:read'] })));
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Nuevo presupuesto/ })).not.toBeInTheDocument();
  });
});
