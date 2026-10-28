import { X } from 'lucide-react';
import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';
import { Button } from './ui';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Si se indica, el contenido es un formulario y el botón principal lo envía. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel?: string;
  submitVariant?: 'primary' | 'danger';
  submitting?: boolean;
  cancelLabel?: string;
}

/**
 * Diálogo modal sobre el elemento <dialog> nativo: gestiona el foco, Escape y la capa
 * inerte del resto de la página sin dependencias externas.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  onSubmit,
  submitLabel = 'Guardar',
  submitVariant = 'primary',
  submitting = false,
  cancelLabel = 'Cancelar',
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const content = (
    <>
      <div className="dialog__header">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p id={descId}>{description}</p>}
        </div>
        <Button variant="ghost" size="sm" iconOnly icon={X} onClick={onClose} aria-label="Cerrar" disabled={submitting} />
      </div>
      {children && <div className="dialog__body">{children}</div>}
      <div className="dialog__footer">
        <Button variant="ghost" onClick={onClose} disabled={submitting}>
          {cancelLabel}
        </Button>
        {onSubmit && (
          <Button type="submit" variant={submitVariant} loading={submitting}>
            {submitLabel}
          </Button>
        )}
      </div>
    </>
  );

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (!submitting) onClose();
      }}
      onClick={(e) => {
        // Clic en el fondo (fuera de la caja) cierra.
        if (e.target === ref.current && !submitting) onClose();
      }}
    >
      {open &&
        (onSubmit ? (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(e);
            }}
          >
            {content}
          </form>
        ) : (
          content
        ))}
    </dialog>
  );
}
