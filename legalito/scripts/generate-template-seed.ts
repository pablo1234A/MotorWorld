import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildTemplateSeedSql } from "../src/lib/documents/seed-sql";

const target = join(__dirname, "..", "supabase", "seed", "templates.sql");
writeFileSync(target, buildTemplateSeedSql());
console.log(`Seed de plantillas generado en ${target}`);
