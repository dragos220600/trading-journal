import { defineConfig } from "drizzle-kit";

const remote = process.env.TURSO_DATABASE_URL;

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: remote
    ? { url: remote, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url: "file:./data/journal.db" },
});
