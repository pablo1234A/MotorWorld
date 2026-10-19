import { useEffect } from 'react';
import { StoreProvider, useStore } from './data/store';
import { UIProvider } from './components/AppUI';
import { Shell } from './components/Shell';
import { ConfirmHost, Confetti, Skeleton, Toaster } from './components/ui';
import { useRoute } from './lib/router';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Prospects from './pages/Prospects';
import ProspectDetail from './pages/ProspectDetail';
import Calendar from './pages/Calendar';
import Tasks from './pages/Tasks';
import FollowUps from './pages/FollowUps';
import Messages from './pages/Messages';
import Audit from './pages/Audit';
import Pricing from './pages/Pricing';
import Coach from './pages/Coach';
import Objections from './pages/Objections';
import Goals from './pages/Goals';
import Analytics from './pages/Analytics';
import Prospecting from './pages/Prospecting';
import Resources from './pages/Resources';
import Assistant from './pages/Assistant';
import Settings from './pages/Settings';
import More from './pages/More';

/** Texto oscuro o claro sobre el acento según su luminancia. */
function inkFor(hex: string) {
  const m = hex.replace('#', '');
  const n = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.4 ? '#0b0c0d' : '#ffffff';
}

function Theme() {
  const { state } = useStore();
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--accent', state.settings.accent);
    root.style.setProperty('--accent-ink', inkFor(state.settings.accent));
    root.classList.toggle('reduce-motion', state.settings.reduceMotion);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#08090a');
  }, [state.settings.accent, state.settings.reduceMotion]);
  return null;
}

function Router() {
  const { parts } = useRoute();
  const [a, b] = parts;
  switch (a) {
    case undefined:
      return <Dashboard />;
    case 'prospects':
      return b ? <ProspectDetail id={b} key={b} /> : <Prospects />;
    case 'prospecting':
      return <Prospecting />;
    case 'calendar':
      return <Calendar />;
    case 'tasks':
      return <Tasks />;
    case 'followups':
      return <FollowUps />;
    case 'messages':
      return <Messages />;
    case 'audit':
      return <Audit />;
    case 'pricing':
      return <Pricing />;
    case 'coach':
      return <Coach sub={b} key={b ?? 'coach'} />;
    case 'objections':
      return <Objections id={b} key={b ?? 'list'} />;
    case 'goals':
      return <Goals />;
    case 'analytics':
      return <Analytics />;
    case 'resources':
      return <Resources />;
    case 'assistant':
      return <Assistant />;
    case 'settings':
      return <Settings />;
    case 'more':
      return <More />;
    default:
      return <Dashboard />;
  }
}

function LoadingShell() {
  return (
    <div className="app">
      <aside className="sidebar">
        <Skeleton h={28} w={140} />
        <div className="mt-24 col gap-12">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} h={14} w={`${60 + ((i * 13) % 30)}%`} />
          ))}
        </div>
      </aside>
      <div className="page">
        <Skeleton h={14} w={160} />
        <div className="mt-12">
          <Skeleton h={44} w="50%" />
        </div>
        <div className="mt-24">
          <Skeleton h={160} r={18} />
        </div>
        <div className="grid g4 mt-16">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} h={110} r={18} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Root() {
  const { state, loading } = useStore();
  if (loading) return <LoadingShell />;
  if (!state.onboarded) return <Onboarding />;
  return (
    <UIProvider>
      <div className="ambient" />
      <Shell>
        <Router />
      </Shell>
    </UIProvider>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Theme />
      <Root />
      <Toaster />
      <Confetti />
      <ConfirmHost />
    </StoreProvider>
  );
}
