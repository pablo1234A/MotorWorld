import { useMutation, useQuery } from '@tanstack/react-query';
import { MailX } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { api } from '../api/client';
import { Alert, Button, ErrorAlert, Skeleton } from '../components/ui';
import { usePageTitle } from '../lib/usePageTitle';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Baja de los emails de seguimiento (enlace del pie de cada email). La ve el cliente de la
 * empresa, no un usuario de Presupio: sin marketing ni navegación. La baja exige un clic
 * explícito, para que los antivirus que abren enlaces no den de baja a nadie por error.
 */
export function UnsubscribePage() {
  usePageTitle('Darse de baja');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const valid = TOKEN.test(token);
  const preview = useQuery({
    queryKey: ['unsubscribe', token],
    queryFn: () => api<{ companyName: string; alreadyUnsubscribed: boolean }>('/public/unsubscribe/preview', { method: 'POST', body: { token } }),
    enabled: valid,
    retry: false,
    staleTime: Infinity,
  });
  const confirm = useMutation({
    mutationFn: () => api<{ message: string; companyName: string }>('/public/unsubscribe', { method: 'POST', body: { token } }),
  });

  let content: React.ReactNode;
  if (!valid) {
    content = (
      <Alert tone="error" title="Enlace no válido">
        Abre el enlace completo que aparece al final del email. Si no funciona, responde al email y pide que no te escriban más.
      </Alert>
    );
  } else if (preview.isPending) {
    content = <Skeleton height="6rem" />;
  } else if (preview.isError) {
    content = <ErrorAlert error={preview.error} title="No hemos podido comprobar el enlace" />;
  } else if (confirm.isSuccess || preview.data.alreadyUnsubscribed) {
    content = (
      <Alert tone="success" title="Baja registrada">
        {confirm.data?.message ?? `Ya estabas dado de baja. No recibirás más correos de seguimiento de ${preview.data.companyName}.`}
      </Alert>
    );
  } else {
    content = (
      <div className="stack">
        <p>
          <strong>{preview.data.companyName}</strong> te ha escrito para hacer el seguimiento de un presupuesto que solicitaste. Si prefieres no
          recibir más correos de seguimiento, confirma tu baja.
        </p>
        {confirm.isError && <ErrorAlert error={confirm.error} />}
        <div>
          <Button variant="primary" icon={MailX} loading={confirm.isPending} onClick={() => confirm.mutate()}>
            No quiero recibir más correos
          </Button>
        </div>
        <p className="small muted">Si tienes dudas sobre el presupuesto, puedes responder directamente al email.</p>
      </div>
    );
  }

  return (
    <main className="public-page" id="contenido">
      <div className="public-page__card">
        <h1>Correos de seguimiento</h1>
        {content}
        <p className="public-page__foot small muted">Servicio de envío gestionado con Presupio en nombre de la empresa que te escribió.</p>
      </div>
    </main>
  );
}
