ALTER TABLE "classes" DROP CONSTRAINT "classes_school_teacher_unique";--> statement-breakpoint
ALTER TABLE "classes" ALTER COLUMN "teacher_id" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "classes_school_teacher_unique" ON "classes" USING btree ("school_id","teacher_id") WHERE "classes"."teacher_id" IS NOT NULL;