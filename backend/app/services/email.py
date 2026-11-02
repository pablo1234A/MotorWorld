from __future__ import annotations

import asyncio
import logging
import smtplib
from email.message import EmailMessage

from ..config import get_settings

log = logging.getLogger(__name__)
# Dev/test outbox (only used when SMTP is not configured).
OUTBOX: list[dict[str, str]] = []


def _send_sync(msg: EmailMessage) -> None:
    s = get_settings()
    with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=20) as smtp:
        if s.smtp_starttls:
            smtp.starttls()
        if s.smtp_user:
            smtp.login(s.smtp_user, s.smtp_password or "")
        smtp.send_message(msg)


async def send_password_reset(to: str, token: str) -> None:
    s = get_settings()
    link = f"{s.public_web_url.rstrip('/')}/reset-password?token={token}"
    body = (f"Hola,\n\nHemos recibido una solicitud para restablecer tu contraseña de {s.app_name}.\n"
            f"Abre este enlace (válido {s.password_reset_minutes} minutos):\n\n{link}\n\n"
            "Si no lo has solicitado, ignora este mensaje.\n")
    if not s.smtp_host:
        OUTBOX.append({"to": to, "subject": "Restablecer contraseña", "body": body, "token": token})
        if not s.is_production:
            log.warning("SMTP no configurado: enlace de restablecimiento para %s -> %s", to, link)
        else:
            log.error("SMTP no configurado en producción: no se pudo enviar el email de restablecimiento")
        return
    msg = EmailMessage()
    msg["From"] = s.smtp_from
    msg["To"] = to
    msg["Subject"] = f"{s.app_name}: restablecer contraseña"
    msg.set_content(body)
    try:
        await asyncio.to_thread(_send_sync, msg)
    except Exception:  # noqa: BLE001
        log.exception("password reset email failed")
