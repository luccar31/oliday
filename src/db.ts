import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import { loadEnv } from './config.js';

let client: PrismaClient | undefined;

/** Cliente Prisma compartido (driver adapter `pg`, Postgres local). */
export function getDb(): PrismaClient {
  if (!client) {
    const adapter = new PrismaPg({ connectionString: loadEnv().DATABASE_URL });
    client = new PrismaClient({ adapter });
  }
  return client;
}

export async function disconnectDb(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
