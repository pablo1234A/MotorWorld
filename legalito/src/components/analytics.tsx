"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Analítica de primera parte sin cookies ni almacenamiento en el dispositivo:
 * no requiere consentimiento. Solo envía el nombre del evento, la ruta, el
 * dominio de referencia y parámetros UTM. No identifica visitantes anónimos.
 */
export function track(name: string, props: Record<string, string | number | boolean> = {}) {
  try {
    const url = new URL(window.location.href);
    const body = JSON.stringify({
      name,
      path: url.pathname,
      referrer: document.referrer || null,
      utm_source: url.searchParams.get("utm_source"),
      utm_medium: url.searchParams.get("utm_medium"),
      utm_campaign: url.searchParams.get("utm_campaign"),
      props,
    });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/analytics", new Blob([body], { type: "application/json" }));
    else void fetch("/api/analytics", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } });
  } catch {
    // La analítica nunca debe romper la experiencia.
  }
}

export function Analytics() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!pathname || last.current === pathname) return;
    last.current = pathname;
    if (navigator.webdriver) return; // Excluye navegación automatizada.
    track("page_view");
    if (pathname === "/precios") track("pricing_view");
  }, [pathname]);
  return null;
}

/** Dispara un evento al montarse (p. ej. vista de la página de compra). */
export function TrackEvent({ name, props }: { name: string; props?: Record<string, string | number | boolean> }) {
  useEffect(() => {
    track(name, props);
  }, [name, props]);
  return null;
}
