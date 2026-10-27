import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles/app.css';
import { api } from './lib/api';
import { LiveProvider } from './lib/live';
import { RouterProvider, match, useRouter } from './lib/router';
import { Shell } from './components/Shell';
import { Toasts } from './components/ui';
import { Login } from './pages/Login';
import { ControlCenter } from './pages/ControlCenter';
import { Office } from './pages/Office';
import { Chat } from './pages/Chat';
import { Products, ProductEditor } from './pages/Products';
import { Work } from './pages/Work';
import { Deliveries } from './pages/Deliveries';
import { Approvals } from './pages/Approvals';
import { Reports } from './pages/Reports';
import { Agents, AgentProfile } from './pages/Agents';
import { Memory } from './pages/Memory';
import { Logs } from './pages/Logs';
import { SettingsPage } from './pages/Settings';

type Owner = { id: string; email: string; name: string };

function Routes() {
  const { path } = useRouter();
  const m = (p: string) => match(p, path);
  let params: Record<string, string> | null;
  if ((params = m('/products/:id'))) return <ProductEditor id={params.id} />;
  if ((params = m('/chat/:agent'))) return <Chat agent={params.agent} />;
  if ((params = m('/agents/:id'))) return <AgentProfile id={params.id} />;
  switch (path.split('?')[0]) {
    case '/office': return <Office />;
    case '/chat': return <Chat agent="ATLAS" />;
    case '/products': return <Products />;
    case '/work': return <Work />;
    case '/deliveries': return <Deliveries />;
    case '/approvals': return <Approvals />;
    case '/reports': return <Reports />;
    case '/agents': return <Agents />;
    case '/memory': return <Memory />;
    case '/logs': return <Logs />;
    case '/settings': return <SettingsPage />;
    default: return <ControlCenter />;
  }
}

function App() {
  const [auth, setAuth] = useState<{ hasOwner: boolean; owner: Owner | null } | null>(null);
  const refresh = () => api.get<{ hasOwner: boolean; owner: Owner | null }>('/api/auth/status').then(setAuth).catch(() => setAuth({ hasOwner: true, owner: null }));
  useEffect(() => {
    void refresh();
    const onUnauth = () => setAuth((a) => (a ? { ...a, owner: null } : a));
    window.addEventListener('apc:unauthorized', onUnauth);
    return () => window.removeEventListener('apc:unauthorized', onUnauth);
  }, []);
  if (!auth) return null;
  if (!auth.owner) return <Login hasOwner={auth.hasOwner} onDone={refresh} />;
  return (
    <LiveProvider>
      <RouterProvider>
        <Shell owner={auth.owner}>
          <Routes />
        </Shell>
      </RouterProvider>
    </LiveProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toasts />
  </StrictMode>,
);
