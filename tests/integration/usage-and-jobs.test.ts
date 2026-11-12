import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, createTestUser, deleteTestUser, setPlan, type TestUser } from "../support/supabase";

let user: TestUser;
let other: TestUser;

beforeAll(async () => {
  [user, other] = await Promise.all([createTestUser("usage"), createTestUser("usage-other")]);
});
afterAll(async () => {
  await Promise.all([deleteTestUser(user), deleteTestUser(other)]);
});

const consume = (target: TestUser, key = randomUUID()) => target.client.rpc("consume_usage", { p_workspace: target.workspaceId, p_operation: "generation", p_idempotency_key: key });
const summary = async (target: TestUser) => (await target.client.rpc("get_usage_summary", { p_workspace: target.workspaceId })).data as Record<string, number>;

describe("control de consumo", () => {
  it("un reintento con la misma clave no se cuenta dos veces", async () => {
    const key = randomUUID();
    const first = await consume(user, key);
    const retry = await consume(user, key);
    expect(first.data).toMatchObject({ allowed: true, duplicate: false, used: 1 });
    expect(retry.data).toMatchObject({ allowed: true, duplicate: true, used: 1 });
  });

  it("peticiones simultáneas nunca superan el límite del plan (10 en Free)", async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => consume(user)));
    const allowed = results.filter((result) => (result.data as { allowed: boolean }).allowed).length;
    expect(results.every((result) => result.error === null)).toBe(true);
    expect(allowed).toBe(9); // 1 ya consumida en la prueba anterior
    expect((await summary(user)).used).toBe(10);
    expect(((await consume(user)).data as { reason: string }).reason).toBe("monthly_limit");
  });

  it("los errores del sistema devuelven la cuota (solo una vez)", async () => {
    const admin = adminClient();
    const { data: records } = await admin.from("usage_records").select("idempotency_key").eq("workspace_id", user.workspaceId).limit(1);
    const key = records![0]!.idempotency_key;
    const refund = await admin.rpc("refund_usage", { p_workspace: user.workspaceId, p_idempotency_key: key });
    const again = await admin.rpc("refund_usage", { p_workspace: user.workspaceId, p_idempotency_key: key });
    expect(refund.data).toBe(true);
    expect(again.data).toBe(false);
    expect((await summary(user)).used).toBe(9);
  });

  it("el consumo de un espacio no afecta a otro", async () => {
    expect((await summary(other)).used).toBe(0);
  });
});

describe("generación masiva", () => {
  const items = (count: number) => Array.from({ length: count }, (_, index) => ({ row_number: index + 2, input: { name: `Producto ${index}` } }));
  const createJob = (target: TestUser, count: number) =>
    target.client.rpc("create_generation_job", { p_workspace: target.workspaceId, p_filename: "test.csv", p_source_path: "x", p_options: { platform: "generic" }, p_items: items(count) });

  it("el plan Free no permite trabajos masivos", async () => {
    const { data } = await createJob(other, 2);
    expect(data).toMatchObject({ allowed: false, reason: "plan_required" });
  });

  it("crea el trabajo y reserva el consumo de forma atómica", async () => {
    await setPlan(other.workspaceId, "pro");
    const { data, error } = await createJob(other, 5);
    expect(error).toBeNull();
    expect(data).toMatchObject({ allowed: true, total_items: 5 });
    const usage = await summary(other);
    expect(usage.used).toBe(5);
    expect(usage.bulk_used).toBe(5);
  });

  it("rechaza archivos que superan las filas permitidas por el plan", async () => {
    const { data } = await createJob(other, 501);
    expect(data).toMatchObject({ allowed: false, reason: "too_many_rows" });
  });

  it("reparte elementos sin duplicados, conserva los correctos y devuelve la cuota de los fallos del sistema", async () => {
    const { data: created } = await createJob(other, 4);
    const jobId = (created as { job_id: string }).job_id;
    const before = (await summary(other)).used ?? 0;

    // Dos procesos reclaman a la vez: nunca obtienen el mismo elemento.
    const [a, b] = await Promise.all([other.client.rpc("claim_job_items", { p_job: jobId, p_limit: 3 }), other.client.rpc("claim_job_items", { p_job: jobId, p_limit: 3 })]);
    const claimed = [...(a.data ?? []), ...(b.data ?? [])];
    expect(new Set(claimed.map((item) => item.id)).size).toBe(claimed.length);
    expect(claimed).toHaveLength(4);

    const [i1, i2, i3, i4] = claimed;
    await other.client.rpc("report_job_item", { p_item: i1!.id, p_status: "completed" });
    await other.client.rpc("report_job_item", { p_item: i2!.id, p_status: "completed" });
    await other.client.rpc("report_job_item", { p_item: i3!.id, p_status: "failed", p_error: "Dato no válido", p_system_error: false });
    // Error del sistema: vuelve a la cola hasta agotar 3 intentos.
    await other.client.rpc("report_job_item", { p_item: i4!.id, p_status: "failed", p_error: "Fallo interno", p_system_error: true });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { data: again } = await other.client.rpc("claim_job_items", { p_job: jobId, p_limit: 5 });
      expect(again?.map((item) => item.id)).toEqual([i4!.id]);
      await other.client.rpc("report_job_item", { p_item: i4!.id, p_status: "failed", p_error: "Fallo interno", p_system_error: true });
    }

    const { data: job } = await other.client.from("generation_jobs").select("*").eq("id", jobId).single();
    expect(job).toMatchObject({ status: "partially_completed", successful_items: 2, failed_items: 2, processed_items: 4 });
    expect(job?.completed_at).not.toBeNull();
    // Solo el fallo del sistema se devuelve; el fallo por datos del usuario sí cuenta.
    expect((await summary(other)).used).toBe(before - 1);

    // Un informe repetido sobre un elemento ya resuelto no cambia nada (idempotencia).
    await other.client.rpc("report_job_item", { p_item: i1!.id, p_status: "failed", p_error: "tarde" });
    const { data: after } = await other.client.from("generation_jobs").select("successful_items").eq("id", jobId).single();
    expect(after?.successful_items).toBe(2);

    // Reintento manual de los fallidos: vuelve a reservar consumo.
    const retry = await other.client.rpc("retry_failed_job_items", { p_job: jobId });
    expect(retry.data).toMatchObject({ allowed: true, retried: 2 });
    expect((await summary(other)).used).toBe(before + 1);
    const { data: pending } = await other.client.from("generation_jobs").select("status").eq("id", jobId).single();
    expect(pending?.status).toBe("pending");
  });

  it("otro usuario no puede reclamar ni informar elementos de un trabajo ajeno", async () => {
    const { data: created } = await createJob(other, 1);
    const jobId = (created as { job_id: string }).job_id;
    const claim = await user.client.rpc("claim_job_items", { p_job: jobId, p_limit: 5 });
    expect(claim.error?.code).toBe("42501");
    const { data: items } = await adminClient().from("generation_job_items").select("id").eq("job_id", jobId);
    const report = await user.client.rpc("report_job_item", { p_item: items![0]!.id, p_status: "completed" });
    expect(report.error).not.toBeNull();
    const retry = await user.client.rpc("retry_failed_job_items", { p_job: jobId });
    expect(retry.error?.code).toBe("42501");
  });
});
