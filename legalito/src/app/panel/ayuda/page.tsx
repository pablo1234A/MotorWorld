import type { Metadata } from "next";
import { Badge } from "@/components/ui/feedback";
import { PageHeader, Panel } from "@/components/ui/layout";
import { FaqList, StepsList } from "@/components/marketing/sections";
import { SupportForm } from "@/components/support-form";
import { fmtDate } from "@/components/app/status";
import { getProfile, requireUser } from "@/lib/auth";
import { getPublicFaqs } from "@/lib/public-data";
import { createSessionClient } from "@/lib/supabase/server";
import { DISCLAIMER } from "@/config/site";

export const metadata: Metadata = { title: "Ayuda" };

const STATUS = { open: { l: "Abierta", t: "info" }, in_progress: { l: "En curso", t: "warning" }, closed: { l: "Resuelta", t: "success" } } as const;

export default async function HelpPage() {
  const user = await requireUser();
  const [profile, faqs, db] = await Promise.all([getProfile(), getPublicFaqs(), createSessionClient()]);
  const { data: requests } = await db.from("support_requests").select("id, subject, status, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);

  return (
    <>
      <PageHeader title="Ayuda" description="Respuestas a las dudas más habituales y contacto directo con nuestro equipo." />
      <div className="space-y-6">
        <Panel title="Cómo funciona Legalito">
          <StepsList compact />
          <p className="mt-6 text-sm text-muted">{DISCLAIMER}</p>
        </Panel>
        <div>
          <h2 className="mb-4 text-lg font-semibold">Preguntas frecuentes</h2>
          <FaqList faqs={faqs} />
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Panel title="Escríbenos">
            <SupportForm defaultName={profile?.full_name ?? undefined} defaultEmail={user.email} />
          </Panel>
          <Panel title="Tus consultas">
            {(requests ?? []).length === 0 ? (
              <p className="text-sm text-muted">No has enviado consultas.</p>
            ) : (
              <ul className="divide-y divide-line">
                {(requests ?? []).map((r) => {
                  const s = STATUS[r.status as keyof typeof STATUS];
                  return (
                    <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                      <p className="text-sm font-medium text-ink">{r.subject}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                        {fmtDate(r.created_at)} <Badge tone={s.t}>{s.l}</Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
