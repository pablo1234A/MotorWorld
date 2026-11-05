import { notFound, redirect } from "next/navigation";
import { EditorClient } from "@/components/editor/editor-client";
import { getCurrentUser } from "@/server/auth";
import { getProjectRow, getPublication } from "@/server/projects";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getProjectRow(id);
  return { title: p ? `Editor · ${p.name}` : "Editor" };
}

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/editor/${id}`);
  const p = await getProjectRow(id);
  if (!p || p.userId !== user.id) notFound();
  const pub = await getPublication(id);
  return <EditorClient project={{ id: p.id, slug: p.slug, name: p.name, revision: p.revision, doc: p.doc, publishedAt: pub?.publishedAt.toISOString() ?? null }} />;
}
