import { useSyncExternalStore } from "react";

/** next/navigation replacement: hash-based routing (works from file://). */
const listeners = new Set<() => void>();
let refreshTick = 0;
const emit = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") window.addEventListener("hashchange", emit);

function current() {
  const raw = location.hash.replace(/^#/, "") || "/";
  return raw;
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function normalize(p: string) {
  return p === "/login" || p === "/register" ? "/dashboard" : p;
}

export function useRouter() {
  return {
    push: (p: string) => {
      location.hash = normalize(p);
    },
    replace: (p: string) => {
      history.replaceState(null, "", `#${normalize(p)}`);
      emit();
    },
    refresh: () => {
      refreshTick++;
      emit();
    },
    back: () => history.back(),
    prefetch: () => undefined,
  };
}

export function usePathname() {
  return useSyncExternalStore(subscribe, () => current().split("?")[0], () => "/");
}

export function useSearchParams() {
  const q = useSyncExternalStore(subscribe, () => current().split("?")[1] ?? "", () => "");
  return new URLSearchParams(q);
}

/** Changes whenever router.refresh() is called (pages use it to reload their data). */
export function useRefreshTick() {
  return useSyncExternalStore(subscribe, () => refreshTick, () => 0);
}

export function redirect(p: string) {
  location.hash = normalize(p);
}
export function notFound() {
  location.hash = "/dashboard";
}
