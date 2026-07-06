import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

/**
 * Turso (hosted libSQL) in production via TURSO_DATABASE_URL +
 * TURSO_AUTH_TOKEN; a local SQLite file for development when the env
 * vars are absent.
 */
const url = process.env.TURSO_DATABASE_URL ?? localFileUrl();

function localFileUrl() {
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return `file:${path.join(dataDir, "journal.db").replace(/\\/g, "/")}`;
}

const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
export { schema };
