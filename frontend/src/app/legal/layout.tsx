import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <Link href="/" className="mb-10 inline-flex items-center gap-2 text-[14px] font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-lg border border-line-2 bg-panel-2"><span className="h-2.5 w-2.5 rounded-full border-2 border-accent" /></span>
        MotorWorld <span className="display font-normal text-muted italic">Studio</span>
      </Link>
      {children}
    </div>
  );
}
