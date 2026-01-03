import postgres from 'postgres';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const sql = postgres(process.env.DATABASE_URL!);

async function migrate() {
    console.log('Starting migration...');
    try {
        await sql`
      CREATE TABLE IF NOT EXISTS "user" (
        "id" text PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "email" text NOT NULL,
        "email_verified" boolean NOT NULL,
        "image" text,
        "download_count" text DEFAULT '0',
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "user_email_unique" UNIQUE("email")
      );
    `;
        console.log('Table "user" created or verified.');

        await sql`
      CREATE TABLE IF NOT EXISTS "clips" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "url" text NOT NULL,
        "title" text NOT NULL,
        "start_time" text NOT NULL,
        "end_time" text NOT NULL,
        "public_url" text NOT NULL,
        "thumbnail" text,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `;
        console.log('Table "clips" created or verified.');

        await sql`
      CREATE TABLE IF NOT EXISTS "jobs" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "status" text DEFAULT 'processing' NOT NULL,
        "error" text,
        "public_url" text,
        "storage_path" text,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `;
        console.log('Table "jobs" created or verified.');

        // Ensure the personal-user exists
        const users = await sql`SELECT id FROM "user" WHERE id = 'personal-user'`;
        if (users.length === 0) {
            await sql`
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
        VALUES ('personal-user', 'Personal User', 'personal@clippa.in', true, now(), now())
      `;
            console.log('User "personal-user" created.');
        } else {
            console.log('User "personal-user" already exists.');
        }

    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await sql.end();
        console.log('Migration finished.');
    }
}

migrate();
