import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JobRunner } from "@/components/app/job-runner";
import { isUuid } from "@/lib/utils";
import { requireSession } from "@/server/auth/session";
import { ApiError } from "@/server/http/errors";
import { getJob } from "@/server/services/jobs";

export const metadata: Metadata = { title: "Trabajo de generación" };

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const context = await requireSession();
  const detail = await getJob(context, id).catch((error) => {
    if (error instanceof ApiError && error.code === "not_found") notFound();
    throw error;
  });
  return (
    <>
      <Link href="/app/masivo" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-3.5" aria-hidden /> Anuncios masivos
      </Link>
      <h1 className="mb-6 text-[26px] font-semibold leading-tight">Trabajo de generación</h1>
      <JobRunner initialJob={detail.job} initialFailed={detail.failedItems} />
    </>
  );
}
