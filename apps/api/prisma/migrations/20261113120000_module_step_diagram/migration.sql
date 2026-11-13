-- A picture step can hold a line diagram drawn by the app from plain shapes (AI-suggested, teacher-checked).
ALTER TABLE "learning_module_steps" ADD COLUMN "diagram" JSONB;
