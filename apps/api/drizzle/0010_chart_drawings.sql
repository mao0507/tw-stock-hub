CREATE TABLE "members"."chart_drawings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stock_id" varchar(10) NOT NULL,
	"kind" varchar(10) NOT NULL,
	"points" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drawing_kind_valid" CHECK ("kind" IN ('hline', 'trend'))
);
--> statement-breakpoint
ALTER TABLE "members"."chart_drawings" ADD CONSTRAINT "chart_drawings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "members"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chart_drawings_user_stock" ON "members"."chart_drawings" USING btree ("user_id","stock_id");