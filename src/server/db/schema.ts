import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { SiteDocument } from "@/engine/schema";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("users_email_idx").on(t.email)]);

export const sessions = pgTable("sessions", {
  /** sha256 of the session token; the raw token only lives in the httpOnly cookie. */
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  kind: text("kind").notNull(),
  doc: jsonb("doc").$type<SiteDocument>().notNull(),
  /** Increments on every save; used for optimistic concurrency. */
  revision: integer("revision").default(1).notNull(),
  engine: text("engine").default("local").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (t) => [uniqueIndex("projects_slug_idx").on(t.slug), index("projects_user_idx").on(t.userId)]);

export const projectVersions = pgTable("project_versions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  doc: jsonb("doc").$type<SiteDocument>().notNull(),
  label: text("label").notNull(),
  source: text("source").notNull(), // generate | manual | auto | ai | publish | restore
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("versions_project_idx").on(t.projectId, t.createdAt)]);

export const publications = pgTable("publications", {
  projectId: text("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  doc: jsonb("doc").$type<SiteDocument>().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("publications_slug_idx").on(t.slug)]);

export const assets = pgTable("assets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  storageKey: text("storage_key").notNull(),
  kind: text("kind").notNull(), // image | video | font | file
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("assets_user_idx").on(t.userId)]);

export const formSubmissions = pgTable("form_submissions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  formId: text("form_id").notNull(),
  page: text("page").notNull(),
  data: jsonb("data").$type<Record<string, string>>().notNull(),
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("submissions_project_idx").on(t.projectId, t.createdAt)]);

export const chatMessages = pgTable("chat_messages", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // user | assistant
  content: text("content").notNull(),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("chat_project_idx").on(t.projectId, t.createdAt)]);

export const deployments = pgTable("deployments", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // hosted | vercel
  status: text("status").notNull(),
  url: text("url"),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("deployments_project_idx").on(t.projectId, t.createdAt)]);

export const domains = pgTable("domains", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  hostname: text("hostname").notNull(),
  verified: boolean("verified").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("domains_hostname_idx").on(t.hostname)]);
