import { useEffect, useState } from 'react';

/**
 * Hora actual para pintar estados que dependen del tiempo («vencido», «hace 5 min»). Se lee
 * una vez al montar y se refresca cada `intervalMs`: el render no llama a Date.now() (debe
 * ser puro) y los estados se actualizan solos si la página sigue abierta.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
