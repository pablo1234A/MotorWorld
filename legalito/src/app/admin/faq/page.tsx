import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader, Panel } from "@/components/ui/layout";
import { ActionForm } from "@/components/admin/action-form";
import { requireAdmin } from "@/lib/auth";
import { createSessionClient } from "@/lib/supabase/server";
import { deleteFaq, saveFaq } from "@/lib/actions/admin";

interface FaqRow {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
  published: boolean;
}

function FaqFields({ f }: { f?: FaqRow }) {
  const key = f?.id ?? "new";
  return (
    <>
      <Field id={`q-${key}`} label="Pregunta" required><Input id={`q-${key}`} name="question" defaultValue={f?.question} /></Field>
      <Field id={`a-${key}`} label="Respuesta" required><Textarea id={`a-${key}`} name="answer" rows={3} defaultValue={f?.answer} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id={`c-${key}`} label="Categoría" required>
          <Select id={`c-${key}`} name="category" defaultValue={f?.category ?? "general"}>
            <option value="general">General</option>
            <option value="documentos">Documentos</option>
            <option value="suscripcion">Suscripción</option>
            <option value="pagos">Pagos</option>
          </Select>
        </Field>
        <Field id={`o-${key}`} label="Orden" required><Input id={`o-${key}`} name="sort_order" inputMode="numeric" defaultValue={f?.sort_order ?? 100} /></Field>
        <div className="flex items-end pb-2"><Checkbox name="published" defaultChecked={f?.published ?? true} label="Publicada" /></div>
      </div>
    </>
  );
}

export default async function AdminFaqPage() {
  await requireAdmin();
  const db = await createSessionClient();
  const { data } = await db.from("faqs").select("*").order("sort_order");
  return (
    <>
      <PageHeader title="Preguntas frecuentes" description="Se muestran en la web pública y en la ayuda del panel." />
      <div className="space-y-6">
        <Panel title="Nueva pregunta">
          <ActionForm action={saveFaq.bind(null, null)} submitLabel="Añadir pregunta"><FaqFields /></ActionForm>
        </Panel>
        {((data ?? []) as FaqRow[]).map((f) => (
          <Panel key={f.id}>
            <ActionForm action={saveFaq.bind(null, f.id)} submitLabel="Guardar"><FaqFields f={f} /></ActionForm>
            <form action={deleteFaq.bind(null, f.id)} className="mt-3">
              <Button type="submit" variant="ghost" size="sm" className="text-danger">Eliminar</Button>
            </form>
          </Panel>
        ))}
      </div>
    </>
  );
}
