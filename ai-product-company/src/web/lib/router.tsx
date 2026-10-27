import './transport';
import { createContext, useContext, useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';

/**
 * Minimal router (no dependency). History API on the server edition; hash routes
 * (#/office) in the single-file edition, where file:// forbids pushState.
 */
const useHash = () => window.location.protocol === 'file:' || Boolean(window.__APC_LOCAL__);
const current = () => (useHash() ? window.location.hash.slice(1) || '/' : window.location.pathname + window.location.search);
export const hrefFor = (to: string) => (useHash() ? `#${to}` : to);

const Ctx = createContext<{ path: string; navigate: (to: string) => void }>({ path: '/', navigate: () => {} });

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(current);
  useEffect(() => {
    const onChange = () => setPath(current());
    window.addEventListener('popstate', onChange);
    window.addEventListener('hashchange', onChange);
    return () => {
      window.removeEventListener('popstate', onChange);
      window.removeEventListener('hashchange', onChange);
    };
  }, []);
  const navigate = (to: string) => {
    if (to === path) return;
    if (useHash()) window.location.hash = to;
    else window.history.pushState({}, '', to);
    setPath(to);
    window.scrollTo({ top: 0 });
  };
  return <Ctx.Provider value={{ path, navigate }}>{children}</Ctx.Provider>;
}

export const useRouter = () => useContext(Ctx);

export function Link({ to, children, ...rest }: { to: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { navigate, path } = useRouter();
  const pathname = path.split('?')[0];
  const current = to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(to + '/');
  return (
    <a
      href={hrefFor(to)}
      aria-current={current ? 'page' : undefined}
      {...rest}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        rest.onClick?.(e);
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

/** Match "/products/:id" style patterns. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const a = path.split('?')[0].split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) out[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return out;
}
