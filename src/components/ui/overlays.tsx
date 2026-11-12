"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive, DropdownMenu as MenuPrimitive, Tooltip as TooltipPrimitive } from "radix-ui";
import { useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button, type ButtonVariant } from "./button";

// --- Modal --------------------------------------------------------------------
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const width = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" }[size];
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 animate-fade bg-ink/35 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className={cn("fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 animate-fade flex-col rounded-2xl border border-line bg-surface shadow-raised", width)}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-5">
            <div>
              <DialogPrimitive.Title className="font-sans text-lg font-semibold tracking-normal">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-1 text-sm leading-relaxed text-muted">{description}</DialogPrimitive.Description> : null}
            </div>
            <DialogPrimitive.Close className="-mr-2 -mt-1 rounded-lg p-2 text-muted hover:bg-sunken hover:text-ink" aria-label="Cerrar">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          {children ? <div className="overflow-y-auto px-6 py-4">{children}</div> : <div className="h-4" />}
          {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-paper/60 px-6 py-3.5">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Confirmación para acciones destructivas o irreversibles. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  variant = "danger",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  variant?: ButtonVariant;
  onConfirm: () => Promise<void> | void;
}) {
  const [loading, setLoading] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !loading && onOpenChange(next)}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant={variant}
            loading={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } finally {
                setLoading(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

// --- Menú desplegable -----------------------------------------------------------
export const Menu = MenuPrimitive.Root;
export const MenuTrigger = MenuPrimitive.Trigger;

export function MenuContent({ className, align = "end", ...props }: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn("z-50 min-w-48 animate-fade rounded-xl border border-line bg-surface p-1 shadow-raised", className)}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

export function MenuItem({ className, danger, ...props }: ComponentProps<typeof MenuPrimitive.Item> & { danger?: boolean }) {
  return (
    <MenuPrimitive.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-sunken [&_svg]:size-4 [&_svg]:text-muted",
        danger && "text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function MenuSeparator() {
  return <MenuPrimitive.Separator className="my-1 h-px bg-line" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <MenuPrimitive.Label className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-faint">{children}</MenuPrimitive.Label>;
}

// --- Tooltip -------------------------------------------------------------------
export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-50 max-w-64 animate-fade rounded-lg bg-ink px-2.5 py-1.5 text-xs leading-relaxed text-white shadow-raised">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
