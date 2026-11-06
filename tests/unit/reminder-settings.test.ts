import { describe, expect, it } from "vitest";

import { formatDateTime } from "@/lib/dates";
import { blackoutSchema, isReminderFilter, offsetsSchema, reminderSettingsSchema } from "@/lib/validation/reminders";

const valid = {
  branchId: "6f1d2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b",
  remindersEnabled: "on",
  offsets: "7, 30",
  sendWindowStart: "09:00",
  sendWindowEnd: "19:00",
  "weekdays[]": ["1", "2", "3", "4", "5"],
  defaultIntervalMonths: "12",
  defaultIntervalKm: "15000",
  kmOffsetBefore: "1000",
  replyToEmail: " Taller@Example.com ",
};

describe("configuración de avisos", () => {
  it("normaliza los valores del formulario", () => {
    expect(reminderSettingsSchema.parse(valid)).toEqual({
      branchId: valid.branchId,
      remindersEnabled: true,
      offsets: [30, 7],
      sendWindowStart: "09:00",
      sendWindowEnd: "19:00",
      sendWeekdays: [1, 2, 3, 4, 5],
      defaultIntervalMonths: 12,
      defaultIntervalKm: 15000,
      kmRemindersEnabled: false,
      kmOffsetBefore: 1000,
      replyToEmail: "taller@example.com",
    });
  });

  it("un solo día marcado llega como texto y también vale", () => {
    expect(reminderSettingsSchema.parse({ ...valid, "weekdays[]": "6" }).sendWeekdays).toEqual([6]);
  });

  it("rechaza ventanas invertidas, días vacíos y correos no válidos", () => {
    const r = reminderSettingsSchema.safeParse({ ...valid, sendWindowStart: "19:00", sendWindowEnd: "09:00", "weekdays[]": undefined, replyToEmail: "no" });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["weekdays[]", "replyToEmail"]));
    expect(reminderSettingsSchema.safeParse({ ...valid, sendWindowStart: "19:00", sendWindowEnd: "09:00" }).error?.issues[0].path).toEqual(["sendWindowEnd"]);
    expect(reminderSettingsSchema.safeParse({ ...valid, "weekdays[]": ["8"] }).success).toBe(false);
    expect(reminderSettingsSchema.safeParse({ ...valid, sendWindowStart: "25:00" }).success).toBe(false);
  });

  it("valida los días de antelación (como la BD)", () => {
    expect(offsetsSchema.parse("0")).toEqual([0]);
    expect(offsetsSchema.parse("60 30;7,1")).toEqual([60, 30, 7, 1]);
    expect(offsetsSchema.safeParse("").success).toBe(false);
    expect(offsetsSchema.safeParse("30, 30").success).toBe(false);
    expect(offsetsSchema.safeParse("400").success).toBe(false);
    expect(offsetsSchema.safeParse("-1").success).toBe(false);
    expect(offsetsSchema.safeParse("1,2,3,4,5,6").success).toBe(false);
    expect(offsetsSchema.safeParse("7.5").success).toBe(false);
  });

  it("los límites numéricos coinciden con los CHECK de la tabla", () => {
    expect(reminderSettingsSchema.safeParse({ ...valid, defaultIntervalMonths: "61" }).success).toBe(false);
    expect(reminderSettingsSchema.safeParse({ ...valid, defaultIntervalKm: "999" }).success).toBe(false);
    expect(reminderSettingsSchema.safeParse({ ...valid, kmOffsetBefore: "10001" }).success).toBe(false);
    expect(reminderSettingsSchema.parse({ ...valid, replyToEmail: "" }).replyToEmail).toBeNull();
  });

  it("festivos: fecha real y motivo opcional", () => {
    expect(blackoutSchema.parse({ branchId: valid.branchId, day: "2026-12-25", reason: "" })).toEqual({ branchId: valid.branchId, day: "2026-12-25", reason: null });
    expect(blackoutSchema.safeParse({ branchId: valid.branchId, day: "2026-02-30" }).success).toBe(false);
  });

  it("filtros del panel", () => {
    expect(isReminderFilter("pendientes")).toBe(true);
    expect(isReminderFilter("toString")).toBe(false);
    expect(isReminderFilter(undefined)).toBe(false);
  });
});

describe("formatDateTime", () => {
  it("muestra la hora local del taller", () => {
    expect(formatDateTime(new Date("2026-11-04T08:00:00Z"), "Europe/Madrid")).toBe("04/11/2026, 09:00");
    expect(formatDateTime("2026-07-01T08:00:00Z", "Atlantic/Canary")).toBe("01/07/2026, 09:00");
    expect(formatDateTime(null)).toBe("");
    expect(formatDateTime("no es fecha")).toBe("");
  });
});
