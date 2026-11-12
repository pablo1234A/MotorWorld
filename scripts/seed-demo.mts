/**
 * Datos de DEMOSTRACIÓN para desarrollo local: `pnpm seed:demo`
 * Crea una cuenta demo con productos y anuncios generados con el motor real.
 * Se niega a ejecutarse contra un Supabase que no sea local salvo con --force.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { attributesForCategory, categoryPath, resolveAttributes, type CategoryCatalog } from "../src/domain/categories.ts";
import { composeListing } from "../src/domain/generation/template-provider.ts";
import { MARKETPLACE_PROFILES } from "../src/domain/marketplaces/profiles.ts";
import type { ConditionCode } from "../src/domain/product.ts";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
if (!url || !service || !anon) throw new Error("Faltan variables de Supabase.");
if (!/127\.0\.0\.1|localhost/.test(url) && !process.argv.includes("--force")) {
  console.error("Este script es para entornos locales. Usa --force si de verdad quieres sembrar datos demo en otro entorno.");
  process.exit(1);
}

const EMAIL = "demo@anunciapro.local";
const PASSWORD = "Demo12345";
const admin = createClient(url, service, { auth: { persistSession: false } });

const existing = await admin.from("profiles").select("id").eq("email", EMAIL).maybeSingle();
if (existing.data) await admin.auth.admin.deleteUser(existing.data.id);
const created = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "Cuenta Demo" } });
if (created.error) throw created.error;

const client = createClient(url, anon, { auth: { persistSession: false } });
await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
const { data: workspace } = await client.from("workspaces").select("id").single();

const [categories, attributes] = await Promise.all([client.from("categories").select("*"), client.from("category_attributes").select("*")]);
const catalog: CategoryCatalog = {
  categories: (categories.data ?? []).map((c) => ({ id: c.id, name: c.name, slug: c.slug, parentId: c.parent_id, isCustom: c.workspace_id !== null })),
  attributes: (attributes.data ?? []).map((a) => ({ categoryId: a.category_id, key: a.attribute_key, name: a.attribute_name, type: a.attribute_type, required: a.is_required, options: a.options as string[], unit: a.unit, showInTitle: a.show_in_title, order: a.display_order })),
};
const bySlug = (slug: string) => catalog.categories.find((category) => category.slug === slug && !category.isCustom)!.id;

const products: { slug: string; name: string; brand?: string; price: number; cost?: number; condition: ConditionCode; sku: string; description: string; features?: string[]; defects?: string; attributes: Record<string, string | number | boolean> }[] = [
  { slug: "smartphones", name: "Galaxy S22", brand: "Samsung", price: 330, cost: 210, condition: "very_good", sku: "MOV-001", description: "Usado con funda desde el primer día.", attributes: { almacenamiento: "128 GB", ram: "8 GB", color: "Negro", estado_bateria: 88, libre: true }, defects: "Pequeño arañazo en la trasera." },
  { slug: "sofas", name: "Sofá chaise longue", price: 280, condition: "good", sku: "MUE-014", description: "Sofá amplio con fundas desenfundables.", attributes: { tipo: "Chaise longue", plazas: 3, material: "Tela", color: "Gris claro", dimensiones: "260 × 160 × 85 cm" } },
  { slug: "coches", name: "Golf 1.5 TSI", brand: "Volkswagen", price: 17900, condition: "very_good", sku: "VEH-002", description: "Libro de mantenimiento al día en concesionario.", attributes: { anio: 2020, kilometros: 64000, combustible: "Gasolina", transmision: "Manual", potencia: 150 } },
  { slug: "bicicletas", name: "Bicicleta gravel", brand: "Orbea", price: 890, cost: 600, condition: "like_new", sku: "BIC-007", description: "Apenas 300 km de uso.", attributes: { tipo: "Gravel", talla_cuadro: "M", marchas: 22 } },
  { slug: "consolas", name: "Nintendo Switch OLED", brand: "Nintendo", price: 240, condition: "like_new", sku: "VID-010", description: "Con caja original.", attributes: { plataforma: "Nintendo Switch", almacenamiento: "64 GB", incluye: "Dock y dos mandos Joy-Con" } },
  { slug: "ropa-mujer", name: "Abrigo de lana", brand: "Mango", price: 45, condition: "very_good", sku: "ROP-021", description: "Abrigo largo, ideal para invierno.", attributes: { talla: "M", color: "Camel", material: "Lana" } },
];

for (const item of products) {
  const categoryId = bySlug(item.slug);
  const { data: product, error } = await client
    .from("products")
    .insert({ workspace_id: workspace!.id, name: item.name, brand: item.brand ?? null, price: item.price, cost_price: item.cost ?? null, condition: item.condition, sku: item.sku, description: item.description, features: item.features ?? [], defects: item.defects ?? "", category_id: categoryId, attributes: item.attributes })
    .select()
    .single();
  if (error) throw error;
  const definitions = attributesForCategory(catalog, categoryId);
  const path = categoryPath(catalog, categoryId);
  const profile = item.slug === "ropa-mujer" ? MARKETPLACE_PROFILES.vinted : MARKETPLACE_PROFILES.wallapop;
  const listing = composeListing(
    { name: item.name, category: path.category, subcategory: path.subcategory, brand: item.brand ?? null, model: null, price: item.price, currency: "EUR", condition: item.condition, conditionCustom: null, description: item.description, features: [], defects: item.defects ?? "", location: null, attributes: resolveAttributes(definitions, item.attributes), missingAttributes: [], imageCount: 0 },
    { tone: "professional", length: "medium", language: "es", titleVariant: profile.titleVariant, profile },
  );
  await client.from("listings").insert({ workspace_id: workspace!.id, product_id: product.id, title: listing.title, description: listing.description, short_description: listing.shortDescription, highlights: listing.highlights, selling_points: listing.sellingPoints, keywords: listing.keywords, condition_info: listing.conditionInfo, cta: listing.cta, platform: profile.id, generation_method: "template", status: "draft" });
}

console.log(`Datos de demostración creados.\n  Usuario: ${EMAIL}\n  Contraseña: ${PASSWORD}\n  (Para hacerla administradora: pnpm admin:grant ${EMAIL})`);
