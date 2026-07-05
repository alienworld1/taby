import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

declare global {
  var tabyPostgresClient: ReturnType<typeof postgres> | undefined;
}

function getConnectionString() {
  return process.env.DATABASE_URL;
}

export function hasDatabaseConfig() {
  return Boolean(getConnectionString());
}

function getClient() {
  const connectionString = getConnectionString();

  if (!connectionString) {
    throw new Error("Database is not configured.");
  }

  if (!globalThis.tabyPostgresClient) {
    globalThis.tabyPostgresClient = postgres(connectionString, {
      max: 3,
      prepare: false,
    });
  }

  return globalThis.tabyPostgresClient;
}

export function getDb() {
  return drizzle(getClient(), { schema });
}
