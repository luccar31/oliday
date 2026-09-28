import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/cli.ts db:seed',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://viaje:viaje@localhost:5432/viaje?schema=public',
  },
});
