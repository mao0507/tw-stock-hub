ALTER TABLE "members"."users" ADD COLUMN "telegram_chat_id" varchar(32);--> statement-breakpoint
ALTER TABLE "members"."users" ADD COLUMN "telegram_link_code" varchar(16);--> statement-breakpoint
ALTER TABLE "members"."users" ADD COLUMN "telegram_link_expires_at" timestamp with time zone;