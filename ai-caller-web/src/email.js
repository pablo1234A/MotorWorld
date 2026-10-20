// Email de resultado al propietario (SMTP; con Gmail usa una "contraseña de aplicación").

import nodemailer from "nodemailer";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(s / 60)} min ${s % 60} s`;
}

export function resultSubject(call) {
  return `Resultado llamada — ${call.campaign.restaurantName} — ${call.result}`;
}

export function resultText(call) {
  const a = call.analysis;
  const list = (items) => (items?.length ? items.map((i) => `- ${i}`).join("\n") : "—");
  return `Restaurante: ${call.campaign.restaurantName}
Teléfono: ${call.phone}
Duración: ${formatDuration(call.durationSeconds)}
Resultado: ${call.result} (${call.callStatusLabel})
Nivel de interés: ${a.interest_level}/100
Probabilidad de conversión: ${a.conversion_probability}%

RESUMEN:
${a.summary}

NECESIDAD DETECTADA:
${a.main_need}

OBJECIONES:
Principal: ${a.main_objection}
${list(a.objections)}

QUÉ DIJO EL CLIENTE:
${list(a.customer_key_points)}

PRÓXIMO PASO:
${a.next_step}

TRANSCRIPCIÓN:
${(call.transcript || []).map((t) => `${t.role === "agent" ? "Agente" : "Restaurante"}: ${t.text}`).join("\n") || "No disponible"}`;
}

export function resultHtml(call) {
  const a = call.analysis;
  const row = (k, v) =>
    `<tr><td style="padding:6px 14px 6px 0;color:#6b6b6b;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:6px 0;color:#141414">${v}</td></tr>`;
  const section = (title, body) =>
    `<h3 style="margin:26px 0 8px;font:600 12px/1.2 system-ui,sans-serif;letter-spacing:.08em;color:#6b6b6b">${title}</h3><div style="color:#141414">${body}</div>`;
  const list = (items) =>
    items?.length ? `<ul style="margin:0;padding-left:18px">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "—";
  const transcript = (call.transcript || [])
    .map(
      (t) =>
        `<p style="margin:0 0 8px"><b style="color:${t.role === "agent" ? "#0b5cff" : "#141414"}">${t.role === "agent" ? "Agente" : "Restaurante"}:</b> ${esc(t.text)}</p>`,
    )
    .join("");
  return `<div style="font:14px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:680px">
<table style="border-collapse:collapse">
${row("Restaurante", esc(call.campaign.restaurantName))}
${row("Teléfono", esc(call.phone))}
${row("Duración", formatDuration(call.durationSeconds))}
${row("Resultado", `<b>${esc(call.result)}</b> · ${esc(call.callStatusLabel)}`)}
${row("Nivel de interés", `${a.interest_level} / 100`)}
${row("Probabilidad de conversión", `${a.conversion_probability} %`)}
${a.meeting_datetime ? row("Reunión acordada", esc(a.meeting_datetime)) : ""}
${a.callback_datetime ? row("Volver a llamar", esc(a.callback_datetime)) : ""}
${a.contact_name_role ? row("Interlocutor", `${esc(a.contact_name_role)} · ¿Decide?: ${esc(a.decision_maker)}`) : ""}
${a.contact_details ? row("Contacto", esc(a.contact_details)) : ""}
${a.do_not_call ? row("No volver a llamar", "<b>Sí — añadido a la lista de exclusión</b>") : ""}
</table>
${section("RESUMEN", esc(a.summary))}
${section("NECESIDAD DETECTADA", esc(a.main_need))}
${section("OBJECIONES", `Principal: ${esc(a.main_objection)}${list(a.objections)}`)}
${section("QUÉ DIJO EL CLIENTE", list(a.customer_key_points))}
${a.website_status ? section("SU WEB ACTUAL", esc(a.website_status)) : ""}
${a.recommended_offer ? section("OFERTA QUE ENCAJA", esc(a.recommended_offer)) : ""}
${section("PRÓXIMO PASO", `<b>${esc(a.next_step)}</b>`)}
${a.agent_feedback ? section("MEJORA PARA EL AGENTE", esc(a.agent_feedback)) : ""}
${section("TRANSCRIPCIÓN", transcript || "No disponible")}
<p style="margin-top:26px;color:#8a8a8a;font-size:12px">Llamada ${esc(call.id)} · Twilio ${esc(call.twilioCallSid || "")} · coste estimado ${call.costUsd?.toFixed?.(2) ?? "0.00"} USD</p>
</div>`;
}

export function createMailer(cfg) {
  if (!cfg.email.smtpUser || !cfg.email.smtpPass) return null;
  const transport = nodemailer.createTransport({
    host: cfg.email.smtpHost,
    port: cfg.email.smtpPort,
    secure: cfg.email.smtpPort === 465,
    auth: { user: cfg.email.smtpUser, pass: cfg.email.smtpPass },
  });
  return {
    async sendResult(call) {
      await transport.sendMail({
        from: cfg.email.from,
        to: call.campaign.myEmail || cfg.email.defaultTo,
        subject: resultSubject(call),
        text: resultText(call),
        html: resultHtml(call),
      });
    },
  };
}
