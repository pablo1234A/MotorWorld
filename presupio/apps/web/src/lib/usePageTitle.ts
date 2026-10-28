import { useEffect } from 'react';

/** Título de la pestaña del navegador (también lo anuncian los lectores de pantalla). */
export function usePageTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · Presupio` : 'Presupio';
  }, [title]);
}
