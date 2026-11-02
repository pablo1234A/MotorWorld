import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";

const FAQ: { q: string; a: React.ReactNode }[] = [
  { q: "¿Por qué un modelo aparece como «sin configurar»?", a: <>Cada modelo se ejecuta a través de uno o varios proveedores (Replicate, fal, Hugging Face, Black Forest Labs, ComfyUI…). Si ninguno tiene API key o servidor configurado, el modelo no se puede usar. Añade tu clave en <Link className="underline" href="/settings?tab=keys">Configuración → Claves API</Link> o consulta el <Link className="underline" href="/models?tab=providers">panel de proveedores</Link>.</> },
  { q: "¿Qué puedo hacer gratis?", a: "Todo lo que se ejecuta en el motor local es gratuito e ilimitado: recortes, velocidad, cámara lenta con interpolación, estabilización, corrección de color, reencuadre, subtítulos, mezcla y limpieza de audio, montaje multipista y exportación. Para IA generativa gratuita: Hugging Face incluye créditos mensuales pequeños, ComfyUI y Diffusers se ejecutan en tu propio hardware, y Ollama ofrece LLM locales para el guion." },
  { q: "¿Qué significa el porcentaje de progreso?", a: "Solo mostramos porcentaje cuando el proveedor o FFmpeg informan de un progreso real. Si no lo hacen verás «procesando» sin inventar cifras." },
  { q: "¿Qué pasa si un proveedor falla?", a: "La generación prueba automáticamente el siguiente proveedor configurado para el mismo modelo, y queda registrado en el historial de intentos. Errores de contenido o parámetros no válidos no se reintentan." },
  { q: "¿Se modifica mi archivo original al editar?", a: "Nunca. Cada edición crea una versión nueva enlazada al original; puedes volver a cualquier versión desde el historial del editor." },
  { q: "¿Cómo mantengo un personaje consistente?", a: "En el estudio de películas, define rasgos visuales fijos y genera (o sube) una imagen de referencia por personaje. Los fotogramas con ese personaje se generan con un modelo que acepta imágenes de referencia, y la descripción se añade siempre al prompt. También puedes fijar una semilla. Ningún modelo actual garantiza una consistencia perfecta." },
  { q: "¿Puedo clonar la voz de una persona?", a: "Solo con su autorización expresa. La plataforma usa voces de biblioteca de los proveedores; no clones voces de personas reales sin consentimiento." },
  { q: "¿Cómo exporto mi película?", a: "Desde la pestaña Montaje: «Renderizar» genera un MP4 (H.264/AAC) con FFmpeg. También puedes exportar la línea temporal a OpenTimelineIO (.otio) para DaVinci Resolve u otros editores, y los subtítulos en .srt." },
  { q: "¿Son correctos los costes estimados?", a: "Son aproximaciones basadas en tarifas públicas y pueden haber cambiado. El coste real lo factura cada proveedor en tu cuenta. Comprueba siempre su web de precios." },
];

export default function HelpPage() {
  return (
    <div>
      <PageHeader eyebrow="Centro de ayuda" title={<>¿En qué te <em className="text-muted">ayudamos</em>?</>}>Guía rápida del estudio, respuestas frecuentes y límites de cada herramienta.</PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-2xl border border-line bg-panel p-5 open:bg-panel-2">
              <summary className="cursor-pointer list-none text-[15px] font-medium">{f.q}</summary>
              <div className="mt-3 text-[14px] leading-relaxed text-muted">{f.a}</div>
            </details>
          ))}
        </div>
        <Card className="h-fit space-y-4 p-5 text-[13.5px]">
          <p className="font-medium">Flujo recomendado para una película</p>
          <ol className="list-decimal space-y-1.5 pl-5 text-muted">
            <li>Escribe la idea y desarrolla el guion.</li>
            <li>Revisa personajes y genera sus referencias.</li>
            <li>Genera los fotogramas del storyboard.</li>
            <li>Anima los planos (imagen a vídeo).</li>
            <li>Genera voces, efectos y música.</li>
            <li>Monta, ajusta transiciones y renderiza.</li>
          </ol>
          <div className="border-t border-line pt-4 text-muted">
            <Link href="/legal/privacy" className="block hover:text-text">Política de privacidad →</Link>
            <Link href="/legal/terms" className="mt-1 block hover:text-text">Condiciones de uso →</Link>
            <a href="/api/docs" className="mt-1 block hover:text-text">Documentación de la API →</a>
          </div>
        </Card>
      </div>
    </div>
  );
}
