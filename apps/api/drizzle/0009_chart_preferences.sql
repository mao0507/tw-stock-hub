CREATE TABLE "members"."chart_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"indicator_params" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "members"."chart_preferences" ADD CONSTRAINT "chart_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "members"."users"("id") ON DELETE cascade ON UPDATE no action;