ALTER TABLE "members"."holdings" ALTER COLUMN "realized_pnl" SET DATA TYPE numeric(18, 2);--> statement-breakpoint
ALTER TABLE "members"."holdings" ALTER COLUMN "realized_pnl" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "members"."sell_transactions" ALTER COLUMN "realized_pnl" SET DATA TYPE numeric(18, 2);