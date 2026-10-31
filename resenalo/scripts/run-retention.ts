import { runRetention } from "../src/server/modules/retention";
import { prisma } from "../src/server/db";
runRetention().then((r) => { console.log(r); return prisma.$disconnect(); }).catch((e) => { console.error(e); process.exit(1); });
