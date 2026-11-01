import { LogOut } from "lucide-react";
import { signOut } from "@/lib/actions/auth";

export function UserFooter({ name, email }: { name?: string | null; email: string }) {
  const initials = (name || email).trim().slice(0, 1).toUpperCase();
  return (
    <div className="flex items-center gap-3 px-1">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-semibold text-white">{initials}</span>
      <div className="min-w-0 flex-1">
        {name && <p className="truncate text-sm font-medium text-ink">{name}</p>}
        <p className="truncate text-xs text-muted">{email}</p>
      </div>
      <form action={signOut}>
        <button type="submit" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-subtle hover:bg-white hover:text-navy" aria-label="Cerrar sesión" title="Cerrar sesión">
          <LogOut className="h-4.5 w-4.5" />
        </button>
      </form>
    </div>
  );
}
