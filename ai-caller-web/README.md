# NEXO · Llamadas comerciales con IA (web propia)

Web propia que hace llamadas comerciales reales a restaurantes. Un agente de voz con IA conversa en directo,
clasifica el lead y te manda el resumen por email.

```
Panel web ──► Servidor (este proyecto) ──► Twilio llama al restaurante
                    ▲                          │  voz ⇄ texto (ConversationRelay)
                    │  WebSocket en tiempo real ▼
              Claude (cerebro del agente)  ◄── lo que dice el restaurante
                    │
             al colgar: análisis IA ─► registro + panel + email
```

- **Lo hace este código:** el panel, las reglas (antiduplicados, opt-out, horarios, tope de gasto, interruptor
  de parada), el agente comercial y su conversación en streaming, las interrupciones, el colgado, el análisis
  del lead y el email.
- **Twilio** solo pone la línea telefónica y convierte voz ⇄ texto (ConversationRelay, voces ElevenLabs/Google/Amazon).
- **Claude** (`claude-opus-5-5` por defecto) es el cerebro de la conversación y del análisis.

## Qué necesitas (todo tiene prueba gratuita o crédito inicial; las llamadas reales siempre cuestan algo)
1. **Twilio**: cuenta, un número de teléfono y, en *Voice > Settings*, ConversationRelay disponible.
   - Con la cuenta de prueba solo puedes llamar a números verificados (tu móvil) y Twilio reproduce un aviso al principio.
   - Para llamar desde **tu propio número**, verifícalo en Twilio (*Verified Caller IDs*) y ponlo en "Llamar desde".
2. **Clave de la API de Anthropic** (console.anthropic.com).
3. **Gmail** con una *contraseña de aplicación* (para el email del resultado). Opcional: sin ella, los resultados se ven en el panel.

## Arrancarlo gratis en tu ordenador
```bash
cd ai-caller-web
npm install
cp .env.example .env      # rellénalo
npx ngrok http 3000       # en otra terminal: copia la URL https en PUBLIC_BASE_URL
node --env-file=.env src/server.js
```
Abre la URL https de ngrok, entra con tu `PANEL_PASSWORD`, rellena el formulario y pulsa **Llamar ahora**.
Para la primera prueba, llama a tu propio móvil y marca "Ignorar franja horaria".

Para tenerlo siempre encendido: `render.yaml` lo despliega en Render (plan con disco, de pago).

## Reglas de seguridad
| Regla | Por defecto |
|---|---|
| Interruptor de parada (arriba a la derecha) | — |
| Tope de gasto: no llama si el gasto + una llamada larga lo superaría | 9 $ (`MAX_SPEND_USD`) |
| Opt-out: si piden "no me llaméis más", el número queda bloqueado para siempre | — |
| Antiduplicados | 30 días; 4 h si no contestó |
| Máximo de intentos seguidos sin respuesta | 3 |
| Franjas (Europe/Madrid), sin domingos | 10:00–13:00 y 16:30–20:00 |
| Duración máxima de llamada | 8 min |
| Doble clic / doble envío | bloqueado |
| Saludo con aviso de IA y de grabación, que no se puede interrumpir | — |
| Contestadores: detección de Twilio + el agente cuelga sin dejar mensaje | — |

El gasto es **estimado** (`EST_COST_PER_MINUTE_USD` × minutos). Ajústalo a tus tarifas reales de Twilio y Claude.

## Errores
- **Número inválido** u otros datos mal: la llamada no se hace y el panel dice por qué.
- **Ocupado, no contesta o buzón:** se clasifica `NO_ANSWER` sin gastar IA.
- **Fallo de Twilio:** la llamada queda como `provider_error` con el mensaje de Twilio.
- **Fallo de la IA en la llamada:** el agente se despide con educación y cuelga. Si falla el análisis, el lead queda en `FOLLOW_UP` con la transcripción completa.
- **Webhook perdido o servidor reiniciado:** un vigilante consulta a Twilio el estado real cada 5 min.
- **Email fallido:** se reintenta hasta 3 veces y se puede reenviar desde el panel.

La transcripción se guarda frase a frase en `data/db.json` mientras ocurre: no se pierde aunque algo falle después.

## Tests
`npm test` simula Twilio y Claude y prueba de punta a punta una llamada completa por WebSocket real, además de todas las reglas.

Antes de llamar a negocios reales, revisa la normativa (en España: Ley General de Telecomunicaciones art. 66,
Lista Robinson, RGPD; en la UE, el deber de avisar de que se habla con una IA). Esto no es asesoramiento legal.
