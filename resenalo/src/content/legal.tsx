import type { ReactNode } from "react";
import Link from "next/link";
import { legalInfo } from "@/config/legal";
import { PLANS } from "@/config/plans";
import { formatEur, vatBreakdown } from "@/lib/money";

/** Marca visible para datos que el titular aún debe completar. Nunca se inventan. */
function P({ v, label }: { v: string | null; label: string }) {
  return v ? <strong>{v}</strong> : <mark className="rounded bg-star-100 px-1 font-semibold text-star-800">[PENDIENTE DE COMPLETAR: {label}]</mark>;
}

export function ReviewNotice() {
  return (
    <div className="mb-8 rounded-lg border border-warn-600/25 bg-warn-50 p-4 text-sm text-warn-700">
      <strong>Borrador pendiente de revisión profesional.</strong> Este texto es una base de trabajo adaptada al funcionamiento real de Reseñalo
      (RGPD, LOPDGDD, LSSI-CE). No constituye asesoramiento jurídico ni garantiza el cumplimiento normativo: debe revisarlo un abogado
      antes del lanzamiento comercial, y deben completarse los datos marcados como pendientes.
    </div>
  );
}

function Owner() {
  const l = legalInfo();
  return (
    <ul>
      <li>Titular: <P v={l.ownerName} label="razón social o nombre del titular" /></li>
      <li>NIF/CIF: <P v={l.taxId} label="NIF/CIF" /></li>
      <li>Domicilio: <P v={l.address} label="domicilio social" /></li>
      <li>Datos registrales: <P v={l.registry} label="Registro Mercantil, tomo, folio, hoja (si es sociedad)" /></li>
      <li>Correo de contacto: <P v={l.contactEmail} label="email de contacto" /></li>
    </ul>
  );
}

const pages: Record<string, () => ReactNode> = {
  "aviso-legal": () => (
    <>
      <h2>1. Información del titular</h2>
      <p>En cumplimiento del artículo 10 de la Ley 34/2002, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se informa:</p>
      <Owner />
      <h2>2. Objeto</h2>
      <p>Este sitio web da acceso a Reseñalo, un servicio de software (SaaS) por suscripción que permite a empresas y profesionales automatizar el envío de solicitudes de reseña a sus propios clientes mediante su cuenta de correo electrónico.</p>
      <h2>3. Condiciones de uso</h2>
      <p>El acceso al sitio es gratuito; la contratación del servicio se rige por las <Link href="/legal/condiciones">Condiciones generales de contratación</Link>. El usuario se compromete a hacer un uso lícito del sitio y del servicio y a no emplearlo para enviar comunicaciones no solicitadas, falsear opiniones ni vulnerar derechos de terceros.</p>
      <h2>4. Propiedad intelectual e industrial</h2>
      <p>El software, la marca «Reseñalo», el logotipo, los textos y el diseño son titularidad del titular o de sus licenciantes. Queda prohibida su reproducción o explotación sin autorización.</p>
      <h2>5. Responsabilidad</h2>
      <p>El titular no se responsabiliza de los contenidos que los usuarios redacten en sus plantillas ni de las comunicaciones que envíen a sus clientes, de las que cada usuario es responsable como remitente. Tampoco de las interrupciones causadas por proveedores externos (Google, Microsoft, Stripe) ajenos a su control.</p>
      <h2>6. Legislación y jurisdicción</h2>
      <p>Se aplica la legislación española. Para usuarios empresarios, las partes se someten a los juzgados y tribunales del domicilio del titular, salvo norma imperativa en contrario.</p>
    </>
  ),

  privacidad: () => {
    const l = legalInfo();
    return (
      <>
        <h2>1. Responsable del tratamiento</h2>
        <Owner />
        <p>Delegado de Protección de Datos (si se designa): <P v={l.dpoEmail} label="email del DPD o indicar que no se ha designado" /></p>
        <h2>2. Dos papeles distintos</h2>
        <p><strong>Como responsable</strong>, Reseñalo trata los datos de las personas que se registran y usan la plataforma (usuarios y negocios clientes). <strong>Como encargado del tratamiento</strong>, trata los datos de los clientes finales que cada negocio introduce para enviarles solicitudes de reseña; en ese caso el responsable es el negocio, y el tratamiento se rige por el <Link href="/legal/encargo-tratamiento">Acuerdo de encargo del tratamiento</Link>.</p>
        <h2>3. Datos que tratamos como responsable, finalidades y bases jurídicas</h2>
        <table>
          <thead><tr><th>Datos</th><th>Finalidad</th><th>Base jurídica (RGPD art. 6)</th></tr></thead>
          <tbody>
            <tr><td>Nombre, email, contraseña (cifrada con Argon2id)</td><td>Crear y gestionar la cuenta, autenticación</td><td>Ejecución del contrato (6.1.b)</td></tr>
            <tr><td>Datos del negocio y de facturación, NIF</td><td>Prestación del servicio, facturación y obligaciones fiscales</td><td>Contrato (6.1.b) y obligación legal (6.1.c)</td></tr>
            <tr><td>Datos de pago</td><td>Cobro de la suscripción (los procesa Stripe; no almacenamos tarjetas)</td><td>Contrato (6.1.b)</td></tr>
            <tr><td>Dirección de la cuenta de correo conectada y tokens OAuth cifrados</td><td>Enviar los correos en nombre del negocio</td><td>Contrato (6.1.b)</td></tr>
            <tr><td>IP, navegador, registros de actividad y seguridad</td><td>Seguridad, prevención de fraude y abusos, auditoría</td><td>Interés legítimo (6.1.f)</td></tr>
            <tr><td>Datos de solicitudes de derechos</td><td>Atender el ejercicio de derechos</td><td>Obligación legal (6.1.c)</td></tr>
          </tbody>
        </table>
        <h2>4. Plazos de conservación</h2>
        <ul>
          <li>Datos de cuenta: mientras la cuenta esté activa. Al eliminarla, se borran los datos operativos de forma inmediata.</li>
          <li>Facturas y datos de facturación: 6 años (art. 30 Código de Comercio) y plazos de prescripción tributaria.</li>
          <li>Registros de envío: 13 meses. Registros de auditoría: 24 meses. Sesiones y tokens: hasta su caducidad.</li>
        </ul>
        <h2>5. Destinatarios y encargados</h2>
        <ul>
          <li>Stripe Payments Europe, Ltd. (pagos y facturación).</li>
          <li>Google LLC / Microsoft Corporation, únicamente a través de la cuenta de correo que el propio usuario conecta (API de Gmail / Microsoft Graph).</li>
          <li>Proveedor de alojamiento: <P v={null} label="proveedor de hosting y ubicación de los servidores" />.</li>
          <li>Proveedor de correo transaccional: <P v={null} label="proveedor SMTP (p. ej. Amazon SES, Postmark)" />.</li>
        </ul>
        <p>Algunas de estas entidades pueden realizar transferencias internacionales, amparadas en el Marco de Privacidad de Datos UE‑EE. UU. o en cláusulas contractuales tipo de la Comisión Europea. <P v={null} label="verificar y documentar las garantías de cada proveedor" /></p>
        <h2>6. Uso de datos de Google</h2>
        <p>El uso que hace Reseñalo de la información recibida de las API de Google se ajusta a la <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener noreferrer" target="_blank">Política de datos de usuario de los servicios de API de Google</a>, incluidos los requisitos de uso limitado. Solo solicitamos el permiso de envío (<code>gmail.send</code>) y la dirección de correo; no leemos tu bandeja de entrada.</p>
        <h2>7. Derechos</h2>
        <p>Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad desde tu panel (exportar o eliminar la cuenta) o mediante el <Link href="/legal/derechos">formulario de derechos</Link>. También puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).</p>
        <h2>8. Seguridad</h2>
        <p>Aplicamos cifrado en tránsito (TLS), cifrado AES‑256‑GCM de tokens y secretos, contraseñas con Argon2id, aislamiento de datos entre cuentas, control de accesos, limitación de intentos y registro de actividad.</p>
      </>
    );
  },

  cookies: () => (
    <>
      <h2>1. ¿Qué cookies usamos?</h2>
      <p>Reseñalo utiliza <strong>exclusivamente cookies técnicas estrictamente necesarias</strong>, exentas de consentimiento según el artículo 22.2 de la LSSI-CE y la Guía sobre el uso de cookies de la AEPD. No usamos cookies analíticas, publicitarias ni de terceros.</p>
      <table>
        <thead><tr><th>Cookie</th><th>Finalidad</th><th>Duración</th><th>Tipo</th></tr></thead>
        <tbody>
          <tr><td><code>rsn_session</code></td><td>Mantener la sesión iniciada de forma segura (HttpOnly, SameSite=Lax)</td><td>30 días desde la última actividad</td><td>Propia, técnica</td></tr>
        </tbody>
      </table>
      <p>Las páginas de pago de Stripe, a las que se accede al contratar, establecen sus propias cookies técnicas para prevenir el fraude, bajo su propia política.</p>
      <h2>2. Consentimiento</h2>
      <p>Al no utilizarse cookies que requieran consentimiento, no se muestra un banner de aceptación. Si en el futuro se incorporan cookies analíticas o de marketing, se solicitará el consentimiento previo con un mecanismo que permita aceptarlas, rechazarlas o configurarlas con la misma facilidad, y se actualizará esta política.</p>
      <h2>3. Cómo eliminarlas</h2>
      <p>Puedes borrar las cookies desde la configuración de tu navegador. Si eliminas <code>rsn_session</code>, se cerrará tu sesión.</p>
    </>
  ),

  condiciones: () => (
    <>
      <h2>1. Partes y objeto</h2>
      <p>Estas condiciones regulan la contratación del servicio Reseñalo entre el titular (ver <Link href="/legal/aviso-legal">Aviso legal</Link>) y el cliente que se registra. El servicio está dirigido a <strong>empresas y profesionales</strong> que actúan en el ámbito de su actividad. <P v={null} label="confirmar con asesoría si se admitirán consumidores; en ese caso añadir derecho de desistimiento de 14 días (arts. 102 y ss. TRLGDCU)" /></p>
      <h2>2. Descripción del servicio</h2>
      <p>Reseñalo permite conectar una cuenta de correo mediante OAuth, configurar plantillas, registrar clientes (manualmente, por CSV o por API/webhook) y enviar automáticamente solicitudes de reseña. Los correos se envían desde la cuenta del cliente, sujetos a los límites y políticas de su proveedor (Google o Microsoft).</p>
      <h2>3. Planes, límites y precio</h2>
      <p>Cada plan incluye un número máximo de correos por periodo de facturación (Starter 30, Pro 70, Business 200). Al alcanzarlo, no se envían más correos hasta la renovación o un cambio de plan. Precios e impuestos en <Link href="/legal/precios-e-impuestos">Precios e impuestos</Link>.</p>
      <h2>4. Proceso de contratación</h2>
      <p>1) Registro y verificación del email; 2) elección de plan; 3) pago en la pasarela segura de Stripe; 4) confirmación por correo y acceso al panel; 5) emisión de factura electrónica. El contrato y las facturas quedan disponibles en el apartado de Facturación. Idioma del contrato: español.</p>
      <h2>5. Obligaciones del cliente</h2>
      <ul>
        <li>Disponer de una base legal para contactar a cada destinatario (art. 21.2 LSSI-CE: relación contractual previa) y haber informado a sus clientes conforme al RGPD.</li>
        <li>Enviar solicitudes <strong>neutrales</strong>: está prohibido ofrecer incentivos a cambio de reseñas, solicitarlas solo a clientes satisfechos o publicar reseñas falsas (Directiva (UE) 2019/2161 y normativa de consumo; políticas de Google).</li>
        <li>Respetar las bajas: cada correo incluye un enlace de baja que Reseñalo aplica automáticamente.</li>
        <li>No usar el servicio para spam ni para eludir los límites de los proveedores de correo.</li>
      </ul>
      <h2>6. Duración, renovación y cancelación</h2>
      <p>Suscripción mensual con renovación automática. Ver <Link href="/legal/cancelacion">Suscripciones y cancelación</Link>.</p>
      <h2>7. Impago</h2>
      <p>Si un cobro falla, Stripe reintentará el pago automáticamente. Mientras el pago esté pendiente, los envíos quedan en pausa. Si no se regulariza, la suscripción se cancelará.</p>
      <h2>8. Responsabilidad y disponibilidad</h2>
      <p>El titular pondrá los medios razonables para la disponibilidad del servicio, sin garantizarla de forma ininterrumpida. La responsabilidad total queda limitada a las cantidades abonadas en los 12 meses anteriores, salvo dolo o culpa grave. Reseñalo no garantiza un número de reseñas ni puede confirmar su publicación.</p>
      <h2>9. Protección de datos</h2>
      <p>Respecto de los datos de los clientes finales, el titular actúa como encargado del tratamiento conforme al <Link href="/legal/encargo-tratamiento">Acuerdo de encargo</Link>, que el cliente acepta al configurar su negocio.</p>
      <h2>10. Modificaciones y ley aplicable</h2>
      <p>Los cambios sustanciales se comunicarán con 30 días de antelación. Ley española; jurisdicción según el Aviso legal.</p>
    </>
  ),

  cancelacion: () => (
    <>
      <h2>Renovación automática</h2>
      <p>La suscripción se renueva cada mes en la misma fecha de alta y se cobra al método de pago guardado. El contador de correos del plan se reinicia en cada renovación.</p>
      <h2>Cómo cancelar</h2>
      <p>Desde <strong>Panel → Suscripción y facturación → Cancelar renovación</strong>, o desde el portal de facturación de Stripe. La cancelación es efectiva al final del periodo ya pagado: hasta entonces mantienes el servicio. Puedes revertirla antes de esa fecha.</p>
      <h2>Cambios de plan</h2>
      <p>Al subir de plan, el nuevo límite se aplica de inmediato y se cobra la parte proporcional (prorrateo calculado por Stripe). Al bajar de plan, el nuevo límite también se aplica inmediatamente y se genera el abono proporcional en la siguiente factura.</p>
      <h2>Reembolsos</h2>
      <p>Salvo obligación legal, no se reembolsan los periodos ya iniciados. <P v={null} label="definir política de reembolsos y, si se admiten consumidores, el derecho de desistimiento" /></p>
      <h2>Tras la cancelación</h2>
      <p>Los envíos se detienen al finalizar el periodo. Tus datos se conservan para que puedas reactivar la cuenta, salvo que solicites su eliminación desde Perfil y seguridad.</p>
    </>
  ),

  "precios-e-impuestos": () => (
    <>
      <h2>Precios vigentes</h2>
      <p>Todos los precios mostrados al cliente son <strong>finales, con IVA incluido</strong> (tipo general del 21 %, art. 90 Ley 37/1992).</p>
      <table>
        <thead><tr><th>Plan</th><th>Correos/mes</th><th>Base imponible</th><th>IVA 21 %</th><th>Total</th></tr></thead>
        <tbody>
          {PLANS.map((p) => {
            const v = vatBreakdown(p.priceCents, p.vatRateBps);
            return (
              <tr key={p.code}><td>{p.name}</td><td>{p.monthlyEmailLimit}</td><td>{formatEur(v.baseCents)}</td><td>{formatEur(v.vatCents)}</td><td><strong>{formatEur(v.totalCents)}</strong></td></tr>
            );
          })}
        </tbody>
      </table>
      <h2>Clientes fuera de España</h2>
      <p>La facturación se gestiona con Stripe Tax. Para empresas de otros Estados miembros de la UE con NIF‑IVA válido (VIES) se aplica la inversión del sujeto pasivo; para particulares de la UE, el IVA del país del cliente mediante el régimen OSS; para clientes de fuera de la UE, en general no se repercute IVA español. En estos casos el importe final puede diferir del mostrado.</p>
      <h2>Facturas</h2>
      <p>Cada cobro genera una factura con número, fecha, datos fiscales de ambas partes, base imponible, tipo y cuota de IVA y total, descargable en el panel. <P v={null} label="validar con asesoría fiscal el cumplimiento del Reglamento de facturación (RD 1619/2012) y de VERI*FACTU (RD 1007/2023) para las facturas emitidas por Stripe" /></p>
    </>
  ),

  "encargo-tratamiento": () => (
    <>
      <p>Acuerdo entre el negocio que contrata Reseñalo (<strong>Responsable</strong>) y el titular de Reseñalo (<strong>Encargado</strong>), conforme al art. 28 RGPD y al art. 33 LOPDGDD. Se acepta electrónicamente al configurar el negocio en la plataforma.</p>
      <h2>1. Objeto</h2>
      <p>El Encargado tratará los datos de los clientes del Responsable únicamente para prestar el servicio: almacenarlos, generar y enviar solicitudes de reseña desde la cuenta de correo del Responsable y registrar el resultado de los envíos.</p>
      <h2>2. Datos y categorías de interesados</h2>
      <p>Clientes del Responsable: nombre, email, teléfono (opcional), servicio adquirido, fecha, notas y etiquetas que el Responsable introduzca, historial de envíos, clics en el enlace de reseña y bajas. No deben incluirse categorías especiales de datos (art. 9 RGPD).</p>
      <h2>3. Obligaciones del Encargado</h2>
      <ul>
        <li>Tratar los datos solo siguiendo instrucciones documentadas del Responsable (la configuración que este realiza en la plataforma).</li>
        <li>Garantizar la confidencialidad del personal autorizado.</li>
        <li>Aplicar las medidas de seguridad del art. 32 RGPD: cifrado, aislamiento lógico por cuenta, control de accesos, copias de seguridad, registro de actividad.</li>
        <li>Asistir al Responsable en la atención de derechos y notificarle las violaciones de seguridad sin dilación indebida (máx. 48 horas).</li>
        <li>Al finalizar el servicio, suprimir los datos o devolverlos (exportación) a elección del Responsable.</li>
      </ul>
      <h2>4. Subencargados autorizados</h2>
      <p>Proveedor de alojamiento <P v={null} label="nombre y país" />; Google/Microsoft (únicamente como proveedor de correo elegido por el propio Responsable). El Encargado informará de cualquier cambio con antelación para que el Responsable pueda oponerse.</p>
      <h2>5. Obligaciones del Responsable</h2>
      <p>Contar con base jurídica para el tratamiento y para el envío de las comunicaciones, informar a sus clientes y atender sus derechos.</p>
    </>
  ),
};

export function legalContent(slug: string) {
  return pages[slug]?.();
}
export const legalSlugs = Object.keys(pages);
