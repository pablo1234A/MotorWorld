import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api/client';
import { Dialog } from './Dialog';
import { useToast } from './Toasts';
import { ErrorAlert, Field } from './ui';

/**
 * Supresión irreversible de datos personales (contacto o presupuesto). Exige escribir la
 * palabra de confirmación: la comprobación definitiva la hace el servidor.
 */
export function EraseDialog({
  title,
  description,
  path,
  word,
  successMessage,
  redirectTo,
  onClose,
}: {
  title: string;
  description: ReactNode;
  path: string;
  word: 'ANONIMIZAR' | 'ELIMINAR';
  successMessage: string;
  redirectTo: string;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | undefined>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: () => api(path, { method: 'POST', body: { confirm: word } }),
    onSuccess: () => {
      void queryClient.invalidateQueries();
      toast.success(successMessage);
      onClose();
      void navigate(redirectTo);
    },
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      description={description}
      submitLabel={word === 'ANONIMIZAR' ? 'Anonimizar definitivamente' : 'Eliminar definitivamente'}
      submitVariant="danger"
      submitting={mutation.isPending}
      onSubmit={(e) => {
        e.preventDefault();
        if (typed.trim() !== word) return setError(`Escribe ${word} para confirmar`);
        mutation.mutate();
      }}
    >
      {mutation.isError && <ErrorAlert error={mutation.error} />}
      <Field label={`Escribe ${word} para confirmar`} error={error}>
        <input
          className="input"
          value={typed}
          autoComplete="off"
          onChange={(e) => {
            setTyped(e.target.value);
            setError(undefined);
          }}
        />
      </Field>
    </Dialog>
  );
}
