-- schema 由 db/init/00-setup.sh 預先建立（api 為擁有者）
CREATE SCHEMA IF NOT EXISTS "members";
--> statement-breakpoint
CREATE TABLE "members"."holding_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stock_id" varchar(10) NOT NULL,
	"bought_at" date NOT NULL,
	"price" numeric(12, 4) NOT NULL,
	"shares" integer NOT NULL,
	"fee" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members"."holdings" (
	"user_id" uuid NOT NULL,
	"stock_id" varchar(10) NOT NULL,
	"shares" integer NOT NULL,
	"avg_cost" numeric(12, 4) NOT NULL,
	"realized_pnl" numeric(14, 2) DEFAULT '0' NOT NULL,
	"earned_dividend" numeric(14, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holdings_user_id_stock_id_pk" PRIMARY KEY("user_id","stock_id")
);
--> statement-breakpoint
CREATE TABLE "members"."sell_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stock_id" varchar(10) NOT NULL,
	"sold_at" date NOT NULL,
	"price" numeric(12, 4) NOT NULL,
	"shares" integer NOT NULL,
	"fee" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax" numeric(12, 2) DEFAULT '0' NOT NULL,
	"avg_cost_at_sale" numeric(12, 4) NOT NULL,
	"realized_pnl" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"google_id" varchar(100) NOT NULL,
	"nickname" varchar(50) NOT NULL,
	"avatar_url" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
CREATE TABLE "members"."watchlist_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(50) NOT NULL,
	"color" varchar(20),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members"."watchlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"group_id" uuid,
	"stock_id" varchar(10) NOT NULL,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_watchlist_user_stock" UNIQUE("user_id","stock_id")
);
--> statement-breakpoint
ALTER TABLE "members"."holding_lots" ADD CONSTRAINT "holding_lots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "members"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members"."holdings" ADD CONSTRAINT "holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "members"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members"."sell_transactions" ADD CONSTRAINT "sell_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "members"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members"."watchlist_groups" ADD CONSTRAINT "watchlist_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "members"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members"."watchlists" ADD CONSTRAINT "watchlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "members"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members"."watchlists" ADD CONSTRAINT "watchlists_group_id_watchlist_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "members"."watchlist_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_holding_lots_user_stock" ON "members"."holding_lots" USING btree ("user_id","stock_id","bought_at");--> statement-breakpoint
CREATE INDEX "idx_sell_tx_user_stock" ON "members"."sell_transactions" USING btree ("user_id","stock_id","sold_at");--> statement-breakpoint
CREATE INDEX "idx_watchlist_groups_user" ON "members"."watchlist_groups" USING btree ("user_id");