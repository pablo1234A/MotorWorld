# Recursos externos necesarios (aún no existen en el proyecto)

| Recurso | Uso | Sustituye a |
|---|---|---|
| Rider humanoide con rig (2 cuerpos), LOD0–2 | Personaje | `RiderRig` (primitivas + IK) |
| Ropa modular con el mismo esqueleto (camisetas, sudaderas, chaquetas, vaqueros, shorts, cargo, zapatillas, cascos, rodilleras, guantes) | Editor de rider | Colores sobre primitivas |
| Clips de animación: push, idle, crouch, pop, land, bail/ragdoll, barspin, tailwhip, bri flip, x-up, superman, no-footed, can-can, manuals, 7 grinds, celebraciones | `RiderAnimator` (`AnimationKey`) | Poses procedurales |
| Modelos de piezas de scooter (deck, manillar, horquilla, ruedas, abrazaderas, pegs, freno) con pivotes `Headtube`, `Bars`, `DeckPivot` | `ScooterVisual` | Cubos y cilindros |
| Kits de entorno (rampas, mobiliario, edificios, vegetación) + texturas PBR (hormigón, asfalto, madera, metal, baldosa) | Zonas de `WorldBuilder` | Mallas y texturas procedurales |
| Foley grabado: rodadura por superficie, grinds, aterrizajes, impactos, pasos, ambiente urbano y costero | `AudioManager` | Sonidos sintetizados |
| Música con licencia | `AudioManager` | Loop generado |
| Fuente deportiva condensada con licencia (TTF) | `UIKit` | Fuente del sistema operativo |
| Proveedor de red (p. ej. Unity Netcode + Relay/Lobby, Photon o Nakama) y credenciales | `INetworkService` | `OfflineNetworkService` |
