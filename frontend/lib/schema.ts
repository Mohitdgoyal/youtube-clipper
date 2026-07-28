import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/** Personal-use tables only — auth-era session/account/verification/clips removed. */
export const user = sqliteTable("user", {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: integer('email_verified', { mode: 'boolean' }).notNull(),
	image: text('image'),
	downloadCount: integer('download_count').default(0),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const jobs = sqliteTable("jobs", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
	status: text("status").notNull().default("processing"),
    stage: text("stage"),
	progress: integer("progress").default(0),
	error: text("error"),
	publicUrl: text("public_url"),
	storagePath: text("storage_path"),
	createdAt: integer("created_at", { mode: 'timestamp' }).notNull(),
});
