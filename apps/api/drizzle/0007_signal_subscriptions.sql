CREATE TABLE "members"."signal_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stock_id" varchar(10) NOT NULL,
	"signal" varchar(40) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_notified_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_signal_subscriptions" UNIQUE("user_id","stock_id","signal")
);
--> statement-breakpoint
ALTER TABLE "members"."signal_subscriptions" ADD CONSTRAINT "signal_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "members"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_signal_subscriptions_stock" ON "members"."signal_subscriptions" USING btree ("stock_id","signal");