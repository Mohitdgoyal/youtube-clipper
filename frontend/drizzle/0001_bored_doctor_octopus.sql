CREATE TABLE "clips" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"public_url" text NOT NULL,
	"thumbnail" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "payment" CASCADE;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "status" SET DEFAULT 'processing';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "download_count" text DEFAULT '0';--> statement-breakpoint
ALTER TABLE "clips" ADD CONSTRAINT "clips_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "is_large_file";--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN "updated_at";