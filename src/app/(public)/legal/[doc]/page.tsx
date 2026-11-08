import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Dato, LegalShell } from "@/components/site/legal";
import { BRAND } from "@/config/brand";
import { LEGAL_VERSION, legalOwner, legalOwnerComplete, SUBPROCESSORS } from "@/config/legal";

const DOCS = {
  "aviso-legal": "Aviso legal",
  privacidad: "Política de privacidad",
  terminos: "Términos y condiciones del servicio",
  cookies: "Política de cookies",
  "encargo-tratamiento": "Contrato de encargo del tratamiento",
} as const;
type Doc = keyof typeof DOCS;

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params;
  return { title: `${DOCS[doc as Doc] ?? "Legal"} · ${BRAND.name}` };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (!(doc in DOCS)) notFound();
  const o = legalOwner();
  const titular = (
    <>
      <Dato value={o.name} label="nombre o razón social" /> (NIF <Dato value={o.taxId} label="NIF" />), con domicilio en{" "}
      <Dato value={o.address} label="domicilio" /> y correo electrónico <Dato value={o.email} label="correo de contacto" />
      {o.registry ? `, inscrita en ${o.registry}` : ""}
    </>
  );
  const body: Record<Doc, React.ReactNode> = {
    "aviso-legal": (
      <>
        <h2>1. Titular</h2>
        <p>
          En cumplimiento de la Ley 34/2002, de servicios de la sociedad de la información y de comercio electrónico (LSSI-CE), se informa de que el sitio
          web {o.domain} y el servicio {BRAND.name} son titularidad de {titular} (en adelante, «{BRAND.name}»).
        </p>
        <h2>2. Objeto</h2>
        <p>
          {BRAND.name} es un programa web para talleres mecánicos: gestión de clientes, vehículos e historial de revisiones, avisos automáticos por correo,
          citas y presupuestos. Se ofrece a empresas y profesionales mediante suscripción.
        </p>
        <h2>3. Condiciones de uso del sitio</h2>
        <p>
          Quien navega por el sitio se compromete a usarlo conforme a la ley y a estas condiciones. El uso del servicio por los talleres se rige por los{" "}
          <Link href="/legal/terminos">términos y condiciones</Link>.
        </p>
        <h2>4. Propiedad intelectual</h2>
        <p>
          El software, el diseño y los textos de {BRAND.name} pertenecen a su titular o se usan con licencia. Los datos que el taller introduce son del
          taller. Las marcas de terceros (Google, Stripe…) pertenecen a sus titulares.
        </p>
        <h2>5. Responsabilidad</h2>
        <p>
          {BRAND.name} procura que el sitio funcione sin interrupciones y sin errores, pero no puede garantizarlo. No responde de los contenidos de sitios
          de terceros enlazados.
        </p>
        <h2>6. Legislación y jurisdicción</h2>
        <p>Se aplica la legislación española. Para cualquier controversia, las partes se someten a los juzgados y tribunales que correspondan conforme a la ley.</p>
      </>
    ),
    privacidad: (
      <>
        <p>
          Esta política explica cómo trata {BRAND.name} los datos personales. Hay dos situaciones distintas, y conviene separarlas:
        </p>
        <ul>
          <li>
            <strong>Datos de los talleres y sus usuarios</strong> (quien se registra y usa el panel): {BRAND.name} es el <strong>responsable</strong> del
            tratamiento.
          </li>
          <li>
            <strong>Datos de los clientes de cada taller</strong> (nombre, contacto, vehículos, historial, citas): el <strong>responsable es el taller</strong>.{" "}
            {BRAND.name} los trata solo por su encargo, según el <Link href="/legal/encargo-tratamiento">contrato de encargo del tratamiento</Link>. Si eres
            cliente de un taller y quieres ejercer tus derechos, dirígete al taller; si nos escribes, le trasladaremos tu petición.
          </li>
        </ul>
        <h2>1. Responsable</h2>
        <p>{titular}.</p>
        <h2>2. Qué datos tratamos, para qué y con qué base</h2>
        <table>
          <thead>
            <tr>
              <th>Datos</th>
              <th>Finalidad</th>
              <th>Base jurídica (RGPD)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Nombre, apellidos, correo y contraseña (cifrada, nunca en claro) de los usuarios</td>
              <td>Crear la cuenta, dar acceso al panel, seguridad de la cuenta</td>
              <td>Ejecución del contrato (art. 6.1.b)</td>
            </tr>
            <tr>
              <td>Datos del taller: nombre comercial, razón social, NIF, dirección, logo, contacto</td>
              <td>Prestar el servicio y mostrar la marca del taller en sus correos</td>
              <td>Ejecución del contrato (art. 6.1.b)</td>
            </tr>
            <tr>
              <td>Datos de facturación (los de la tarjeta los trata Stripe; {BRAND.name} no los ve)</td>
              <td>Cobrar la suscripción y emitir facturas</td>
              <td>Ejecución del contrato y obligación legal (art. 6.1.b y c)</td>
            </tr>
            <tr>
              <td>Registros técnicos y de seguridad (acciones importantes, intentos de acceso, IP truncada)</td>
              <td>Seguridad, prevención del fraude y resolución de incidencias</td>
              <td>Interés legítimo (art. 6.1.f)</td>
            </tr>
            <tr>
              <td>Correos de servicio al taller (bienvenida, avisos de facturación, resúmenes)</td>
              <td>Informar sobre el servicio contratado</td>
              <td>Ejecución del contrato (art. 6.1.b)</td>
            </tr>
          </tbody>
        </table>
        <p>No se toman decisiones automatizadas con efectos jurídicos ni se elaboran perfiles. No se envía publicidad sin consentimiento.</p>
        <h2>3. Cuánto tiempo</h2>
        <ul>
          <li>Mientras la cuenta esté activa.</li>
          <li>Si el taller cancela: 60 días en solo lectura, por si vuelve o quiere exportar sus datos; después se borran.</li>
          <li>Clientes y vehículos borrados: 30 días en la papelera; después se borran definitivamente.</li>
          <li>Registro de correos enviados y de acciones: 24 meses. Registro de peticiones a la API: 30 días.</li>
          <li>Facturas: el plazo que exija la ley fiscal y mercantil.</li>
        </ul>
        <h2>4. A quién se comunican</h2>
        <p>
          A nadie, salvo obligación legal. Para prestar el servicio se usan estos proveedores (encargados del tratamiento), con contrato y, si están fuera
          del Espacio Económico Europeo, con las garantías del RGPD (cláusulas contractuales tipo o Marco de Privacidad de Datos UE-EE. UU.):
        </p>
        <table>
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Para qué</th>
              <th>Dónde</th>
            </tr>
          </thead>
          <tbody>
            {SUBPROCESSORS.map((s) => (
              <tr key={s.name}>
                <td>{s.name}</td>
                <td>{s.purpose}</td>
                <td>{s.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>5. Tus derechos</h2>
        <p>
          Puedes pedir el acceso, la rectificación, la supresión, la limitación, la portabilidad y oponerte al tratamiento escribiendo a{" "}
          <Dato value={o.email} label="correo de contacto" />. Respondemos en el plazo de un mes. Si crees que no hemos atendido bien tu petición, puedes
          reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).
        </p>
        <h2>6. Seguridad</h2>
        <p>
          Conexiones cifradas, contraseñas guardadas con un algoritmo de un solo sentido, datos separados por taller en la base de datos, accesos limitados
          por permisos, copias de seguridad y registro de las acciones importantes.
        </p>
      </>
    ),
    terminos: (
      <>
        <h2>1. Partes y objeto</h2>
        <p>
          Estos términos regulan el uso de {BRAND.name}, prestado por {titular}, por parte del taller que se registra (el «Cliente»). El servicio se dirige a
          empresas y profesionales; no a consumidores.
        </p>
        <h2>2. Cuenta</h2>
        <p>
          El Cliente es responsable de que los datos de registro sean ciertos, de custodiar sus contraseñas y de los usuarios que invita. Debe avisar
          enseguida si sospecha de un acceso no autorizado.
        </p>
        <h2>3. Planes, prueba y precios</h2>
        <ul>
          <li>Planes Pro, Max, Business y Excelencia, con los precios y límites que se publican en la web. Precios sin IVA.</li>
          <li>Prueba gratuita de 7 días, una por taller. Se pide la tarjeta al empezar y no se cobra hasta que termina la prueba.</li>
          <li>Pago mensual o anual (con dos meses gratis), por adelantado, a través de Stripe. Las facturas están en el panel.</li>
          <li>
            Los cambios de plan se prorratean. Para bajar de plan, los datos del taller tienen que caber en los límites del nuevo plan. Un cambio de precios
            se avisa con al menos 30 días de antelación y se aplica desde la siguiente renovación.
          </li>
        </ul>
        <h2>4. Impago</h2>
        <p>
          Si un cobro falla, el Cliente mantiene el acceso completo durante 7 días para actualizar la tarjeta. Después, la cuenta pasa a solo lectura y se
          pausan los avisos hasta que se regularice el pago.
        </p>
        <h2>5. Cancelación y datos</h2>
        <p>
          El Cliente puede cancelar cuando quiera desde el panel. La cancelación tiene efecto al final del periodo pagado y no se devuelven los periodos ya
          iniciados. Después, los datos se conservan 60 días en solo lectura y se borran.
        </p>
        <h2>6. Uso aceptable</h2>
        <ul>
          <li>El Cliente solo carga datos de sus propios clientes, obtenidos legalmente, y es responsable de su exactitud.</li>
          <li>
            Los avisos son comunicaciones de servicio sobre el mantenimiento del vehículo. No se pueden usar para enviar publicidad ni para escribir a
            personas que no sean clientes del taller.
          </li>
          <li>Se prohíbe intentar acceder a datos de otros talleres, saturar el servicio o eludir los límites del plan.</li>
          <li>{BRAND.name} puede suspender una cuenta que incumpla estas normas o ponga en riesgo la entregabilidad de los correos de los demás talleres.</li>
        </ul>
        <h2>7. Disponibilidad y soporte</h2>
        <p>
          {BRAND.name} pone los medios razonables para que el servicio esté disponible y hace copias de seguridad, pero no garantiza un funcionamiento sin
          interrupciones. Soporte por correo; prioritario en Business y Excelencia.
        </p>
        <h2>8. Responsabilidad</h2>
        <p>
          {BRAND.name} no responde de los daños indirectos ni del lucro cesante. La responsabilidad total por cualquier reclamación se limita al importe
          pagado por el Cliente en los 12 meses anteriores, salvo dolo o culpa grave.
        </p>
        <h2>9. Protección de datos</h2>
        <p>
          Respecto a los datos de los clientes del taller, {BRAND.name} actúa como encargado del tratamiento conforme al{" "}
          <Link href="/legal/encargo-tratamiento">contrato de encargo del tratamiento</Link>, que forma parte de estos términos.
        </p>
        <h2>10. Cambios y ley aplicable</h2>
        <p>
          Los cambios importantes de estos términos se avisan por correo con 30 días de antelación. Se aplica la legislación española y, para cualquier
          controversia, los juzgados del domicilio del titular, salvo que la ley disponga otra cosa.
        </p>
      </>
    ),
    cookies: (
      <>
        <p>
          {BRAND.name} solo usa <strong>cookies técnicas</strong>, necesarias para que funcione el servicio. Están exentas de consentimiento (art. 22.2 de la
          LSSI-CE) y por eso no se muestra ningún aviso de cookies. No se usan cookies de publicidad ni de analítica de terceros.
        </p>
        <table>
          <thead>
            <tr>
              <th>Cookie</th>
              <th>Para qué</th>
              <th>Duración</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>sb-…-auth-token</td>
              <td>Mantener la sesión iniciada en el panel</td>
              <td>Sesión, renovada mientras se usa</td>
            </tr>
            <tr>
              <td>ry_org</td>
              <td>Recordar qué taller está activo si perteneces a varios</td>
              <td>1 año</td>
            </tr>
            <tr>
              <td>ry_google_state</td>
              <td>Proteger la conexión con Google Calendar (solo durante la conexión)</td>
              <td>10 minutos</td>
            </tr>
          </tbody>
        </table>
        <p>
          En la página pública para pedir cita puede cargarse Cloudflare Turnstile (comprobación anti-bots) si el servicio lo tiene activado; se usa solo
          para seguridad. Si se añadiera analítica u otras cookies no técnicas, se pedirá antes el consentimiento.
        </p>
      </>
    ),
    "encargo-tratamiento": (
      <>
        <p>
          Contrato conforme al artículo 28 del Reglamento (UE) 2016/679 (RGPD) y a la Ley Orgánica 3/2018 (LOPDGDD), entre el taller que da de alta su
          cuenta (el «Responsable») y {titular} (el «Encargado»). Se acepta al crear el taller en {BRAND.name} y queda registrado con su fecha y versión.
        </p>
        <h2>1. Objeto y duración</h2>
        <p>
          El Encargado trata datos personales por cuenta del Responsable solo para prestar el servicio {BRAND.name}, durante la vigencia de la suscripción y
          el periodo de conservación posterior (60 días).
        </p>
        <h2>2. Datos y personas afectadas</h2>
        <ul>
          <li>Personas: clientes del taller, personas que piden cita y usuarios del taller.</li>
          <li>Datos: identificación y contacto (nombre, correo, teléfono), vehículos (matrícula, marca, modelo, bastidor, kilómetros), historial de revisiones, citas y presupuestos, y registros de envío de correos.</li>
          <li>No se tratan categorías especiales de datos. El Responsable no debe introducirlas en las notas.</li>
        </ul>
        <h2>3. Tratamientos</h2>
        <p>Alojamiento, consulta, cálculo de las próximas revisiones, envío de avisos y correos de citas y presupuestos en nombre del taller, informes, copias de seguridad y borrado.</p>
        <h2>4. Obligaciones del Encargado</h2>
        <ul>
          <li>Tratar los datos solo según las instrucciones documentadas del Responsable (la configuración que este hace en el panel).</li>
          <li>Garantizar la confidencialidad del personal autorizado.</li>
          <li>
            Aplicar medidas de seguridad adecuadas (art. 32): cifrado en tránsito, separación de los datos de cada taller en la base de datos, control de
            accesos por permisos, registro de acciones, copias de seguridad y secretos cifrados.
          </li>
          <li>Ayudar al Responsable a atender los derechos de los interesados (exportación, rectificación, supresión, baja de avisos).</li>
          <li>Notificar al Responsable, sin dilación indebida, cualquier violación de la seguridad de los datos.</li>
          <li>Al terminar el servicio, suprimir los datos tras el periodo de conservación, salvo obligación legal.</li>
          <li>Poner a disposición del Responsable la información necesaria para demostrar el cumplimiento y permitir auditorías razonables.</li>
        </ul>
        <h2>5. Subencargados</h2>
        <p>
          El Responsable autoriza de forma general a los siguientes subencargados. El Encargado avisará de los cambios con antelación para que el Responsable
          pueda oponerse.
        </p>
        <table>
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Para qué</th>
              <th>Dónde</th>
            </tr>
          </thead>
          <tbody>
            {SUBPROCESSORS.filter((s) => s.name !== "Stripe").map((s) => (
              <tr key={s.name}>
                <td>{s.name}</td>
                <td>{s.purpose}</td>
                <td>{s.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>6. Obligaciones del Responsable</h2>
        <ul>
          <li>Disponer de una base jurídica para tratar los datos de sus clientes e informarles de ello.</li>
          <li>Usar los avisos solo como comunicaciones de servicio (no publicidad sin consentimiento).</li>
          <li>Atender los derechos de sus clientes y mantener sus datos exactos.</li>
        </ul>
      </>
    ),
  };
  return (
    <LegalShell title={DOCS[doc as Doc]} version={LEGAL_VERSION} complete={legalOwnerComplete(o)}>
      {body[doc as Doc]}
    </LegalShell>
  );
}
