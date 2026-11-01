import Link from "next/link";
import { cn } from "@/lib/cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("h-7 w-7 shrink-0", className)}>
      <path d="M8.5 2.5h10.75L26.5 9.75V27a2.5 2.5 0 0 1-2.5 2.5H8.5A2.5 2.5 0 0 1 6 27V5a2.5 2.5 0 0 1 2.5-2.5Z" fill="#1F3A5F" />
      <path d="M19.25 2.5v5.25a2 2 0 0 0 2 2h5.25Z" fill="#2F5D8C" />
      <path d="m11 17.25 3.5 3.5 6.75-7" fill="none" stroke="#F4F1EA" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 rounded-md", className)} aria-label="Legalito, inicio">
      <LogoMark />
      <span className="text-[19px] font-semibold tracking-tight text-navy">Legalito</span>
    </Link>
  );
}
