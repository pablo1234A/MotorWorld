import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { localParts } from "@/lib/dates";
import {
  DEFAULT_TEMPLATES,
  renderWorkshopEmail,
  unknownVariables,
} from "@/lib/email/reminder-email";
import { buildIcs } from "@/lib/ics";
import {
  formatEuro,
  lineAmounts,
  parseDecimalInput,
  quoteTotals,
} from "@/lib/quotes/money";
import { checkTaxId, normalizeTaxId } from "@/lib/tax-id";
import {
  availabilityRuleSchema,
  publicBookingSchema,
} from "@/lib/validation/appointments";
import { templateSchema } from "@/lib/validation/email";
import {
  detectImage,
  organizationProfileSchema,
} from "@/lib/validation/organization";
import { quoteSchema } from "@/lib/validation/quotes";
import {
  bookingToken,
  unsubscribeToken,
  verifyBookingToken,
  verifyUnsubscribeToken,
} from "@/server/email/links";

describe("importes de presupuestos (decimal.js, mismas reglas que la BD)", () => {
  it("redondea cada línea a céntimos, mitad hacia arriba", () => {
    expect(
      lineAmounts({ quantity: "4.5", unitPrice: "12.35", taxRate: 21 }),
    ).toEqual({ subtotal: "55.58", tax: "11.67", total: "67.25" });
    expect(
      lineAmounts({ quantity: "1", unitPrice: "0.05", taxRate: 10 }),
    ).toEqual({ subtotal: "0.05", tax: "0.01", total: "0.06" });
    expect(
      lineAmounts({ quantity: "3", unitPrice: "0.1", taxRate: 0 }),
    ).toEqual({ subtotal: "0.30", tax: "0.00", total: "0.30" });
    // 0.1 + 0.2 en coma flotante daría 0.30000000000000004.
    expect(
      quoteTotals([
        { quantity: "1", unitPrice: "0.1", taxRate: 0 },
        { quantity: "1", unitPrice: "0.2", taxRate: 0 },
      ]).total,
    ).toBe("0.30");
  });

  it("totales y desglose por tipo de IVA", () => {
    const t = quoteTotals([
      { quantity: "2", unitPrice: "45.50", taxRate: 21 },
      { quantity: "1", unitPrice: "10", taxRate: 10 },
      { quantity: "1", unitPrice: "20", taxRate: 21 },
    ]);
    expect(t).toEqual({
      subtotal: "121.00",
      taxTotal: "24.31",
      total: "145.31",
      byRate: [
        { rate: 21, base: "111.00", tax: "23.31" },
        { rate: 10, base: "10.00", tax: "1.00" },
      ],
    });
  });

  it("lee cifras escritas a la española", () => {
    expect(parseDecimalInput("4,5", 3)).toBe("4.5");
    expect(parseDecimalInput("1.234,56", 2)).toBe("1234.56");
    expect(parseDecimalInput("12.5", 2)).toBe("12.5");
    expect(parseDecimalInput(" 45 € ", 2)).toBe("45");
    expect(parseDecimalInput("1,234", 2)).toBeNull();
    expect(parseDecimalInput("-3", 2)).toBeNull();
    expect(parseDecimalInput("abc", 2)).toBeNull();
    expect(formatEuro("1234.5")).toMatch(/1234,50\s€|1\.234,50\s€/);
  });

  it("validación del presupuesto", () => {
    const base = {
      customerId: randomUUID(),
      issueDate: "2026-11-08",
      validUntil: "2026-12-08",
    };
    const ok = quoteSchema.parse({
      ...base,
      items: JSON.stringify([
        {
          description: "Aceite",
          quantity: "4,5",
          unitPrice: "12,35",
          taxRate: "21",
        },
      ]),
    });
    expect(ok.items[0]).toEqual({
      description: "Aceite",
      quantity: "4.5",
      unitPrice: "12.35",
      taxRate: 21,
      lineKind: "service", // por defecto (PCI)
    });
    expect(quoteSchema.safeParse({ ...base, items: "[]" }).success).toBe(false);
    expect(
      quoteSchema.safeParse({
        ...base,
        items: JSON.stringify([
          { description: "X", quantity: "0", unitPrice: "1", taxRate: 21 },
        ]),
      }).success,
    ).toBe(false);
    expect(
      quoteSchema.safeParse({
        ...base,
        items: JSON.stringify([
          { description: "X", quantity: "1", unitPrice: "1", taxRate: 7 },
        ]),
      }).success,
    ).toBe(false);
    expect(
      quoteSchema.safeParse({
        ...base,
        validUntil: "2026-11-01",
        items: JSON.stringify([
          { description: "X", quantity: "1", unitPrice: "1", taxRate: 21 },
        ]),
      }).error?.issues[0].path,
    ).toEqual(["validUntil"]);
    expect(quoteSchema.safeParse({ ...base, items: "no-json" }).success).toBe(
      false,
    );
  });
});

describe("NIF, NIE y CIF", () => {
  it.each([
    ["12345678Z", "nif"],
    ["X1234567L", "nie"],
    ["B12345674", "cif"],
    ["A58818501", "cif"],
    ["Q2826000H", "cif"],
    ["FR12345678901", "foreign"],
  ])("%s → %s", (id, kind) => {
    expect(checkTaxId(id)).toBe(kind);
  });

  it("rechaza dígitos de control erróneos", () => {
    expect(checkTaxId("12345678A")).toBe("invalid");
    expect(checkTaxId("X1234567A")).toBe("invalid");
    expect(checkTaxId("B12345675")).toBe("invalid");
    expect(checkTaxId("ES12345678")).toBe("invalid");
    expect(normalizeTaxId(" b-12.345.674 ")).toBe("B12345674");
  });

  it("datos del taller", () => {
    const r = organizationProfileSchema.parse({
      tradeName: "Taller Sur",
      taxId: "b12345674",
      postalCode: "28001",
      phone: "600 123 456",
      brandPrimary: "#AA0000",
    });
    expect(r).toMatchObject({
      taxId: "B12345674",
      phone: "+34600123456",
      brandPrimary: "#aa0000",
      legalName: null,
    });
    expect(
      organizationProfileSchema.safeParse({
        tradeName: "X",
        taxId: "12345678A",
      }).success,
    ).toBe(false);
    expect(
      organizationProfileSchema.safeParse({
        tradeName: "X",
        postalCode: "2800",
      }).success,
    ).toBe(false);
    expect(
      organizationProfileSchema.safeParse({
        tradeName: "X",
        brandPrimary: "red",
      }).success,
    ).toBe(false);
  });

  it("el tipo del logo se decide por su firma, no por la extensión", () => {
    expect(detectImage(Buffer.from("89504e470d0a1a0a0000", "hex"))?.mime).toBe(
      "image/png",
    );
    expect(detectImage(Buffer.from("ffd8ffe000104a46", "hex"))?.mime).toBe(
      "image/jpeg",
    );
    expect(
      detectImage(
        Buffer.concat([
          Buffer.from("RIFF"),
          Buffer.from([0, 0, 0, 0]),
          Buffer.from("WEBPVP8 "),
        ]),
      )?.mime,
    ).toBe("image/webp");
    expect(
      detectImage(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        ),
      ),
    ).toBeNull();
    expect(detectImage(Buffer.from("GIF89a"))).toBeNull();
  });
});

describe("invitación de calendario (.ics)", () => {
  it("formato RFC 5545: CRLF, UTC, escapado y líneas plegadas", () => {
    const ics = buildIcs({
      uid: "abc@revisaya",
      sequence: 2,
      start: new Date("2026-11-10T09:00:00Z"),
      end: new Date("2026-11-10T10:00:00Z"),
      summary: "Cita en Taller Sur, S.L.; revisión",
      location: "Calle Mayor 1, Madrid",
      description: "Línea 1\nLínea 2 " + "x".repeat(100),
      now: new Date("2026-11-08T12:00:00Z"),
    });
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART:20261110T090000Z");
    expect(ics).toContain("SEQUENCE:2");
    expect(ics).toContain("SUMMARY:Cita en Taller Sur\\, S.L.\\; revisión");
    expect(ics).toContain("\\n");
    expect(
      ics.split("\r\n").every((l) => Buffer.byteLength(l, "utf8") <= 75),
    ).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("enlaces firmados", () => {
  const secret = "s".repeat(40);
  it("el enlace de cita no sirve como enlace de baja ni al revés", () => {
    const id = randomUUID();
    const booking = bookingToken(id, secret);
    expect(verifyBookingToken(booking, secret)).toBe(id);
    expect(verifyUnsubscribeToken(booking, secret)).toBeNull();
    expect(verifyBookingToken(unsubscribeToken(id, secret), secret)).toBeNull();
    expect(bookingToken(id, secret)).toBe(booking); // determinista: un reintento genera el mismo enlace
    expect(verifyBookingToken(`${booking}x`, secret)).toBeNull();
  });
});

describe("citas: validación", () => {
  const base = {
    slug: "taller-sur",
    name: "Rosa Gil",
    requestedDate: "2026-11-20",
  };
  it("exige un correo o un teléfono", () => {
    expect(
      publicBookingSchema.safeParse(base).error?.issues[0].message,
    ).toContain("correo o un teléfono");
    expect(
      publicBookingSchema.parse({ ...base, phone: "600 123 456" }),
    ).toMatchObject({ phone: "+34600123456", email: null, token: null });
    expect(
      publicBookingSchema.parse({
        ...base,
        email: "ROSA@x.es",
        plate: "1234 bcd",
      }),
    ).toMatchObject({ email: "rosa@x.es", plate: "1234 BCD" });
    expect(
      publicBookingSchema.safeParse({
        ...base,
        email: "x@y.z",
        requestedDate: "2026-02-30",
      }).success,
    ).toBe(false);
  });
  it("franjas de horario", () => {
    expect(
      availabilityRuleSchema.safeParse({
        branchId: randomUUID(),
        weekday: "1",
        startTime: "13:00",
        endTime: "09:00",
        capacity: "1",
      }).success,
    ).toBe(false);
    expect(
      availabilityRuleSchema.safeParse({
        branchId: randomUUID(),
        weekday: "8",
        startTime: "09:00",
        endTime: "13:00",
        capacity: "1",
      }).success,
    ).toBe(false);
    expect(
      availabilityRuleSchema.parse({
        branchId: randomUUID(),
        weekday: "6",
        startTime: "09:00",
        endTime: "13:00",
        capacity: "2",
      }),
    ).toMatchObject({ weekday: 6, capacity: 2 });
  });
  it("hora local de una cita en la zona del taller", () => {
    expect(
      localParts(new Date("2026-11-10T09:00:00Z"), "Europe/Madrid"),
    ).toEqual({ date: "2026-11-10", time: "10:00" });
    expect(
      localParts(new Date("2026-07-10T09:00:00Z"), "Atlantic/Canary"),
    ).toEqual({ date: "2026-07-10", time: "10:00" });
  });
});

describe("plantillas de los correos de citas", () => {
  it("cada tipo tiene sus variables", () => {
    expect(
      unknownVariables("{fecha_cita} {hora_cita}", "booking_confirmed"),
    ).toEqual([]);
    expect(unknownVariables("{fecha_cita}", "reminder_service_date")).toEqual([
      "fecha_cita",
    ]);
    expect(unknownVariables("{fecha_revision}", "booking_confirmed")).toEqual([
      "fecha_revision",
    ]);
    const r = templateSchema.safeParse({
      kind: "reminder_service_date",
      subject: "Cita el {fecha_cita}",
      body: "x",
      buttonLabel: "y",
      buttonEnabled: "on",
    });
    expect(r.error?.issues[0].path).toEqual(["subject"]);
    expect(
      templateSchema.safeParse({
        kind: "booking_confirmed",
        subject: "Cita el {fecha_cita} a las {hora_cita}",
        body: "x",
        buttonLabel: "y",
      }).success,
    ).toBe(true);
  });

  it("correo de cita: sin enlace de baja, con el mensaje del taller escapado", () => {
    const r = renderWorkshopEmail({
      template: DEFAULT_TEMPLATES.booking_rejected,
      vars: {
        nombre: "Rosa",
        modelo: "Kia Ceed",
        matricula: "1234BCD",
        instalacion: "tu Kia Ceed (1234BCD)",
        fecha_cita: "10/11/2026",
        hora_cita: "10:00",
        taller: "Taller Sur",
      },
      workshop: { name: "Taller Sur" },
      ctaHref: "https://app.test/t/taller-sur/cita",
      note: "Ese día <b>no</b> podemos",
    });
    expect(r.subject).toBe("Sobre tu solicitud de visita en Taller Sur");
    expect(r.text).toContain(
      "no podemos hacer la visita a tu Kia Ceed (1234BCD)",
    );
    expect(r.html).toContain("Ese día &lt;b&gt;no&lt;/b&gt; podemos");
    expect(r.html).not.toContain("No quiero recibir más avisos");
    expect(r.html).toContain("Recibes este correo por tu cita en Taller Sur.");
    expect(r.text).toContain(
      "Pedir otra visita: https://app.test/t/taller-sur/cita",
    );
  });
});
