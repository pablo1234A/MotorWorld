import { PageHeader } from "@/components/ui";

export const metadata = { title: "Condiciones de uso" };

export default function Terms() {
  return (
    <article className="max-w-3xl space-y-5 text-[14.5px] leading-relaxed text-muted [&_h2]:mt-8 [&_h2]:text-[17px] [&_h2]:font-semibold [&_h2]:text-text">
      <PageHeader eyebrow="Legal" title="Condiciones de uso" />
      <p><em>Plantilla base: adáptala a tu jurisdicción y modelo de negocio antes de abrir el servicio al público.</em></p>
      <h2>1. El servicio</h2>
      <p>MotorWorld Studio es una herramienta que orquesta modelos de inteligencia artificial de terceros y herramientas de procesamiento local. La calidad, disponibilidad y precio de cada modelo dependen de su proveedor.</p>
      <h2>2. Uso aceptable</h2>
      <ul className="list-disc pl-5">
        <li>No generes contenido ilegal, sexual con menores, que incite al odio o a la violencia, ni que vulnere derechos de terceros.</li>
        <li>No crees deepfakes engañosos de personas reales ni suplantes identidades.</li>
        <li>No clones la voz o la imagen de personas reales sin su autorización expresa.</li>
        <li>Respeta las políticas de uso de cada proveedor de IA, que también se aplican.</li>
      </ul>
      <h2>3. Licencias de los modelos</h2>
      <p>Cada modelo tiene su licencia (indicada en el Centro de modelos). Algunas no permiten uso comercial (p. ej. pesos de MusicGen), otras excluyen territorios (p. ej. HunyuanVideo excluye la UE) o exigen atribución (planes gratuitos de algunos proveedores). Eres responsable de usar cada resultado conforme a su licencia.</p>
      <h2>4. Tu contenido</h2>
      <p>Conservas los derechos que tengas sobre lo que subes y generas, en la medida que lo permitan la ley y la licencia del modelo. Nos concedes solo los permisos necesarios para almacenarlo y procesarlo para ti.</p>
      <h2>5. Recursos de stock</h2>
      <p>Las imágenes y vídeos de Pexels, Pixabay y Unsplash se rigen por sus licencias; conservamos la atribución en los metadatos de cada archivo importado.</p>
      <h2>6. Costes</h2>
      <p>Los costes mostrados son estimaciones. Si usas tus propias claves, el proveedor te factura directamente.</p>
      <h2>7. Responsabilidad</h2>
      <p>El servicio se ofrece «tal cual». Los modelos generativos pueden producir resultados imprecisos o inesperados; revisa siempre el resultado antes de publicarlo.</p>
    </article>
  );
}
