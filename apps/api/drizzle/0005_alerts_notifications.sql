CREATE TABLE "members"."alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stock_id" varchar(10) NOT NULL,
	"alert_type" varchar(20) NOT NULL,
	"threshold" numeric(16, 4) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"triggered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_type_valid" CHECK ("alert_type" IN ('price_above', 'price_below', 'change_above', 'change_below', 'volume_above'))
);
--> statement-breakpoint
CREATE TABLE "members"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"alert_rule_id" uuid,
	"stock_id" varchar(10),
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "members"."alert_rules" ADD CONSTRAINT "alert_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "members"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members"."notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "members"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members"."notifications" ADD CONSTRAINT "notifications_alert_rule_id_alert_rules_id_fk" FOREIGN KEY ("alert_rule_id") REFERENCES "members"."alert_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_alert_rules_stock" ON "members"."alert_rules" USING btree ("stock_id");--> statement-breakpoint
CREATE INDEX "idx_alert_rules_user" ON "members"."alert_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_created" ON "members"."notifications" USING btree ("user_id","created_at");