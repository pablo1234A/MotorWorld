import { useEffect, useState } from 'react';

export interface Route {
  path: string;
  parts: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const clean = path.startsWith('/') ? path : '/' + path;
  return { path: clean, parts: clean.split('/').filter(Boolean), query: new URLSearchParams(qs) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(href: string) {
  const h = href.startsWith('#') ? href : '#' + href;
  if (window.location.hash === h) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else window.location.hash = h;
}

/** Quita parámetros de un solo uso de la URL sin añadir una entrada al historial. */
export function clearQuery() {
  const [path] = window.location.hash.split('?');
  history.replaceState(null, '', path || '#/');
}
