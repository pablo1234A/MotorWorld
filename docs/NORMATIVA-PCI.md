# Referencia normativa PCI usada por RevisaYa

> **RevisaYa no certifica el cumplimiento normativo.** Ayuda a planificar y a registrar el mantenimiento tomando la normativa como referencia. No emite certificados oficiales ni actas de inspección y no verifica la habilitación de la empresa mantenedora ni la cualificación de sus técnicos. Cada empresa debe revisar la normativa aplicable (estatal, autonómica y municipal), las normas UNE citadas por el reglamento y las instrucciones del fabricante.

## Fuente

- Real Decreto 513/2017, de 22 de mayo, por el que se aprueba el **Reglamento de instalaciones de protección contra incendios (RIPCI)**, texto consolidado del BOE (consultado el 2026-11-08; última modificación del texto: 03/09/2025).
- Anexo II, «Mantenimiento mínimo de las instalaciones de protección activa contra incendios»:
  - **Tabla I**: operaciones que puede realizar personal de una empresa mantenedora **o el personal del usuario o titular** de la instalación (trimestrales y semestrales).
  - **Tabla II**: operaciones a realizar por personal **de una empresa mantenedora** (anuales y quinquenales).

## Cómo se traslada al producto

| Concepto | En RevisaYa |
|---|---|
| Categorías de equipo | Extintores, BIE, hidrantes, columnas secas, detección y alarma, sistemas fijos de extinción, abastecimiento de agua, control de humos y calor, señalización luminiscente y «otros» (`equipment_categories`, con su referencia al RIPCI). |
| Operaciones y periodicidades | `maintenance_action_types` (migración 200), cada una con su periodicidad de referencia, quién la realiza (`owner` = tabla I, `maintainer` = tabla II) y la referencia normativa que se muestra en la ficha del equipo. |
| Qué se programa | Tabla II activada por defecto; tabla I desactivada (la puede hacer el titular). Cada empresa decide en **Configuración → Mantenimiento** qué operaciones programa. |
| Cambiar una periodicidad | Solo se puede **acortar**; alargar la de referencia se rechaza (`interval_longer_than_reference`). |
| Extintores: retimbrado | Operación «Retimbrado (prueba de nivel C)» cada 60 meses desde la fecha de timbrado; como máximo 3 retimbrados. La ficha muestra una **vida útil derivada** (timbrado + 20 años), marcada como orientativa: siempre manda la placa del recipiente y el fabricante. |
| Operaciones no periódicas | Reparación, sustitución, baja y «otra actuación»: se registran sin programar vencimientos; la baja retira el equipo. |

## Lo que no hace RevisaYa

- No genera certificados de instalación ni de mantenimiento con validez oficial; el **parte de trabajo** y el **estado de la instalación** en PDF lo indican en su pie.
- No comunica nada a la Administración ni a organismos de control.
- No decide qué normativa autonómica o municipal aplica a cada establecimiento.
- No comprueba la habilitación de la empresa (registro de empresas mantenedoras) ni la formación de los técnicos; el campo «Notas de cualificación» es información interna de la empresa.

## Mantenimiento de esta referencia

Si cambia el RIPCI o una norma UNE citada, el cambio se hace con una **migración nueva** que actualice `maintenance_action_types` (nunca editando una migración aplicada). Los vencimientos de los equipos se recalculan solos al cambiar la configuración de la empresa; un cambio del catálogo del sistema requiere recalcularlos con `app.recompute_equipment_schedule` dentro de la misma migración.
