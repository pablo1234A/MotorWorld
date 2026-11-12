import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProduct, createTestUser, deleteTestUser, type TestUser } from "../support/supabase";

let alice: TestUser;
let bob: TestUser;
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

beforeAll(async () => {
  [alice, bob] = await Promise.all([createTestUser("storage-a"), createTestUser("storage-b")]);
});
afterAll(async () => {
  await Promise.all([deleteTestUser(alice), deleteTestUser(bob)]);
});

describe("almacenamiento privado", () => {
  it("las fotos solo son accesibles por el espacio propietario", async () => {
    const product = await createProduct(alice);
    const path = `${alice.workspaceId}/${product.id}/${randomUUID()}.png`;
    const upload = await alice.client.storage.from("product-images").upload(path, png, { contentType: "image/png" });
    expect(upload.error).toBeNull();

    const own = await alice.client.storage.from("product-images").download(path);
    expect(own.error).toBeNull();
    const foreign = await bob.client.storage.from("product-images").download(path);
    expect(foreign.data).toBeNull();
    const signed = await bob.client.storage.from("product-images").createSignedUrl(path, 60);
    expect(signed.data).toBeNull();
    const removed = await bob.client.storage.from("product-images").remove([path]);
    expect(removed.data ?? []).toEqual([]);
    expect((await alice.client.storage.from("product-images").download(path)).error).toBeNull();
  });

  it("no se puede subir a la carpeta de otro espacio", async () => {
    const { error } = await bob.client.storage.from("product-images").upload(`${alice.workspaceId}/x/${randomUUID()}.png`, png, { contentType: "image/png" });
    expect(error).not.toBeNull();
  });

  it("el bucket rechaza tipos no permitidos", async () => {
    const { error } = await alice.client.storage.from("product-images").upload(`${alice.workspaceId}/x/${randomUUID()}.html`, new TextEncoder().encode("<script>"), { contentType: "text/html" });
    expect(error).not.toBeNull();
  });

  it("los avatares son privados de cada usuario", async () => {
    const path = `${alice.id}/${randomUUID()}.png`;
    expect((await alice.client.storage.from("avatars").upload(path, png, { contentType: "image/png" })).error).toBeNull();
    expect((await bob.client.storage.from("avatars").download(path)).data).toBeNull();
    expect((await bob.client.storage.from("avatars").upload(`${alice.id}/${randomUUID()}.png`, png, { contentType: "image/png" })).error).not.toBeNull();
  });

  it("los buckets no son públicos", async () => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${alice.workspaceId}/x.png`);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
