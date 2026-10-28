import { useCallback, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import type { Errors } from './validation';

/**
 * Estado de errores de un formulario: combina la validación local con los errores por
 * campo que devuelve la API y lleva el foco al primer campo inválido.
 */
export function useFormErrors() {
  const [errors, setErrorsState] = useState<Errors>({});
  const [formError, setFormError] = useState<unknown>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const focusFirst = useCallback(() => {
    requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  }, []);

  const setErrors = useCallback(
    (next: Errors) => {
      setErrorsState(next);
      if (Object.keys(next).length) focusFirst();
    },
    [focusFirst],
  );

  /** Gestiona un error de la API: errores por campo si los hay; si no, aviso general. */
  const handleError = useCallback(
    (error: unknown, fieldMap: Record<string, string> = {}) => {
      if (error instanceof ApiError) {
        const fields: Errors = {};
        for (const [path, message] of Object.entries(error.fieldErrors())) fields[fieldMap[path] ?? path] = message;
        if (Object.keys(fields).length) {
          setErrors(fields);
          setFormError(error.code === 'VALIDATION_ERROR' ? null : error);
          return;
        }
      }
      setFormError(error);
    },
    [setErrors],
  );

  const reset = useCallback(() => {
    setErrorsState({});
    setFormError(null);
  }, []);

  const clearField = useCallback((name: string) => {
    setErrorsState((e) => {
      if (!e[name]) return e;
      const { [name]: _removed, ...rest } = e;
      return rest;
    });
  }, []);

  return { errors, setErrors, formError, setFormError, handleError, reset, clearField, formRef };
}
