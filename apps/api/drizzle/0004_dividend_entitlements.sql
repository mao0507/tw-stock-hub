CREATE TABLE "members"."dividend_entitlements" (
	"user_id" uuid NOT NULL,
	"stock_id" varchar(10) NOT NULL,
	"ex_date" date NOT NULL,
	"cash_per_share" numeric(10, 4) NOT NULL,
	"shares" integer NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	CONSTRAINT "dividend_entitlements_user_id_stock_id_ex_date_pk" PRIMARY KEY("user_id","stock_id","ex_date")
);
--> statement-breakpoint
ALTER TABLE "members"."holdings" ALTER COLUMN "earned_dividend" SET DATA TYPE numeric(18, 2);--> statement-breakpoint
ALTER TABLE "members"."holdings" ALTER COLUMN "earned_dividend" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "members"."dividend_entitlements" ADD CONSTRAINT "dividend_entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "members"."users"("id") ON DELETE cascade ON UPDATE no action;