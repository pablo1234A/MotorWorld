"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** Refresca la página periódicamente un número limitado de veces (estados de espera). */
export function AutoRefresh({ seconds, maxTimes }: { seconds: number; maxTimes: number }) {
  const router = useRouter();
  const count = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      count.current += 1;
      if (count.current > maxTimes) return clearInterval(id);
      router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds, maxTimes]);
  return null;
}
