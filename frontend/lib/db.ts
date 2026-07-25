import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';

const connectionString = process.env.DATABASE_URL!

const client = createClient({ url: connectionString });
const db = drizzle(client);

export default db;