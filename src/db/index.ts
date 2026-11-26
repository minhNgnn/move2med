import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const g = globalThis as unknown as { __m2mPool?: Pool };
const pool =
  g.__m2mPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
if (process.env.NODE_ENV !== "production") g.__m2mPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
