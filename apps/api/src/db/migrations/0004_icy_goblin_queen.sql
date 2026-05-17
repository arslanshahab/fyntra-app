ALTER TABLE "attendance_records" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "locked_by" uuid;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;