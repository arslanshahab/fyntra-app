CREATE TYPE "public"."holiday_kind" AS ENUM('closed', 'exam', 'half_day');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "school_holidays" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"date" date NOT NULL,
	"label" text NOT NULL,
	"kind" "holiday_kind" NOT NULL,
	"effective_end_time" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_holidays_school_date_uniq" UNIQUE("school_id","date")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "school_holidays" ADD CONSTRAINT "school_holidays_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "school_holidays" ADD CONSTRAINT "school_holidays_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "school_holidays_school_date_idx" ON "school_holidays" USING btree ("school_id","date");
