"use client";

import { History } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { GenerationCard, STATUS_LABEL } from "@/components/jobs";
import { Button, cx, Empty, PageHeader, Select } from "@/components/ui";
import { useGenerations, useModels } from "@/lib/hooks";

function HistoryView() {
  const sp = useSearchParams();
  const focus = sp.get("focus");
  const [status, setStatus] = useState("");
  const [task, setTask] = useState("");
  const [page, setPage] = useState(0);
  const limit = 24;
  const { data } = useGenerations({ status: status || undefined, task: task || undefined, limit, offset: page * limit });
  const tasks = useModels().data?.tasks || {};
  useEffect(() => {
    if (focus) setTimeout(() => document.getElementById(`gen-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 400);
  }, [focus, data]);
  return (
    <div>
      <PageHeader eyebrow="Historial" title={<>Historial de <em className="text-muted">generaciones</em></>}>
        Cada trabajo registra modelo, proveedor, prompt, parámetros, coste estimado, intentos y errores. Puedes cancelar, reintentar, duplicar, guardar, descargar o eliminar.
      </PageHeader>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {["", "queued", "processing", "completed", "failed", "cancelled"].map((s) => (
          <button key={s} onClick={() => { setStatus(s); setPage(0); }} className={cx("rounded-full border px-3 py-1.5 text-[12.5px]", status === s ? "border-accent/60 bg-accent/10" : "border-line-2 text-muted hover:text-text")}>{s ? STATUS_LABEL[s] : "Todos"}</button>
        ))}
        <Select className="ml-auto w-56" value={task} onChange={(e) => { setTask(e.target.value); setPage(0); }}>
          <option value="">Todas las operaciones</option>
          {Object.entries(tasks).map(([k, v]) => <option key={k} value={k}>{v as string}</option>)}
        </Select>
      </div>
      {data?.items.length ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data.items.map((g) => <div key={g.id} className={cx(g.id === focus && "rounded-2xl ring-2 ring-accent")}><GenerationCard g={g} /></div>)}</div>
          <div className="mt-6 flex items-center justify-center gap-3 font-mono text-[12px] text-muted">
            <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>←</Button>
            página {page + 1} de {Math.max(1, Math.ceil(data.total / limit))}
            <Button size="sm" variant="ghost" disabled={(page + 1) * limit >= data.total} onClick={() => setPage(page + 1)}>→</Button>
          </div>
        </>
      ) : (
        <Empty icon={<History className="h-8 w-8" />} title="Sin generaciones con estos filtros" />
      )}
    </div>
  );
}

export default function HistoryPage() {
  return <Suspense><HistoryView /></Suspense>;
}
