import { PageHeader } from "@/components/ui";

export const metadata = { title: "Política de privacidad" };

export default function Privacy() {
  return (
    <article className="max-w-3xl space-y-5 text-[14.5px] leading-relaxed text-muted [&_h2]:mt-8 [&_h2]:text-[17px] [&_h2]:font-semibold [&_h2]:text-text">
      <PageHeader eyebrow="Legal" title="Política de privacidad" />
      <p><em>Plantilla base para el operador del servicio. Revísala con asesoría legal y complétala con tus datos (responsable, domicilio, contacto del DPD) antes de publicar el servicio.</em></p>
      <h2>1. Responsable</h2>
      <p>El responsable del tratamiento es el operador que despliega esta instancia de MotorWorld Studio.</p>
      <h2>2. Datos que tratamos</h2>
      <ul className="list-disc pl-5">
        <li>Cuenta: email, nombre visible, contraseña (almacenada solo como hash Argon2).</li>
        <li>Contenido: archivos que subes, resultados generados, prompts, proyectos y guiones.</li>
        <li>Técnicos: IP y agente de usuario de tus sesiones, registros de uso y errores.</li>
        <li>Claves de proveedores que decidas guardar (cifradas; nunca se muestran de nuevo).</li>
      </ul>
      <h2>3. Finalidad y base legal</h2>
      <p>Prestar el servicio que solicitas (ejecución del contrato), seguridad y prevención de abusos (interés legítimo) y cumplimiento de obligaciones legales.</p>
      <h2>4. Proveedores de IA (encargados del tratamiento)</h2>
      <p>Cuando generas o editas contenido con un modelo en la nube, el prompt y los archivos de entrada se envían al proveedor elegido (por ejemplo Replicate, fal.ai, Hugging Face, Black Forest Labs, ElevenLabs o Anthropic) para procesarlos. Cada uno tiene su propia política de privacidad y puede estar fuera del EEE. Las operaciones del motor local (FFmpeg/Pillow) no salen de la infraestructura del servicio.</p>
      <h2>5. Conservación</h2>
      <p>Conservamos tu contenido mientras mantengas la cuenta. Al eliminar un archivo se borra del almacenamiento; al eliminar la cuenta se borran tus datos y archivos. Las copias de seguridad se rotan según la política del operador.</p>
      <h2>6. Tus derechos</h2>
      <p>Acceso, rectificación, supresión (disponible en Configuración → Eliminar cuenta), oposición, limitación y portabilidad (puedes descargar todos tus archivos). Puedes reclamar ante la autoridad de control (en España, la AEPD).</p>
      <h2>7. Seguridad</h2>
      <p>Aislamiento de datos por usuario, cookies httpOnly, rotación de sesiones, cifrado de claves, validación de archivos por su contenido real y límites de uso.</p>
    </article>
  );
}
