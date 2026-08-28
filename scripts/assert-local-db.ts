import { assertDestructiveLocalOnly } from "../src/lib/db-safety-guard";

const op = process.argv[2] ?? "destructive-db-op";
assertDestructiveLocalOnly(op);
console.log(`[db-safety] OK: ${op} on local DATABASE_URL`);
