import { execSync } from "node:child_process";
import { TEST_ENV } from "./test-env";

export default function setup() {
  execSync("npx prisma migrate deploy", { env: { ...process.env, ...TEST_ENV }, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env: { ...process.env, ...TEST_ENV }, stdio: "pipe" });
}
