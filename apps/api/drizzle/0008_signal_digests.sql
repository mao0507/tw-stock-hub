CREATE TABLE "members"."signal_digests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"group_id" uuid,
	"signals" varchar(40)[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_notified_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "members"."signal_digests" ADD CONSTRAINT "signal_digests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "members"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members"."signal_digests" ADD CONSTRAINT "signal_digests_group_id_watchlist_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "members"."watchlist_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_signal_digests_user" ON "members"."signal_digests" USING btree ("user_id");