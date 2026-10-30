import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { keys } from '../api/queries';

interface LegalInfo {
  legal: { termsUrl: string | null; privacyUrl: string | null; published: boolean };
}

/**
 * Texto de la casilla de aceptación. Enlaza a las versiones publicadas de los términos y de la
 * política de privacidad (las configura la API; en producción son obligatorias). Si no están
 * publicadas (desarrollo, pruebas), lo dice: no se enlaza a borradores.
 */
export function LegalConsentText() {
  const legal = useQuery({ queryKey: keys.legal, queryFn: ({ signal }) => api<LegalInfo>('/public/legal', { signal }), staleTime: Infinity, retry: false });
  const info = legal.data?.legal;
  const link = (url: string | null, label: string) =>
    url ? (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    ) : (
      label
    );
  return (
    <span>
      Acepto los {link(info?.termsUrl ?? null, 'términos del servicio')} y la {link(info?.privacyUrl ?? null, 'política de privacidad')} de Presupio.
      {legal.isSuccess && !info?.published && <span className="cell-sub">Documentos pendientes de publicar en este entorno.</span>}
    </span>
  );
}
