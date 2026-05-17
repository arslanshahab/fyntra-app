CREATE TYPE "public"."tap_event_reason_kind" AS ENUM('forgot_card', 'out_of_band_tap', 'sick', 'leave', 'half_day', 'early_pickup', 'late_arrival', 'in_school_not_in_class', 'other');--> statement-breakpoint
ALTER TABLE "tap_events" ADD COLUMN "manual_reason_kind" "tap_event_reason_kind";--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "working_days" text[] DEFAULT '{"mon","tue","wed","thu","fri"}' NOT NULL;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "half_day_cutoff_time" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "academic_year_start" date;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "academic_year_end" date;