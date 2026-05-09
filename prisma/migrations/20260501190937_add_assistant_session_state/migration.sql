-- AlterTable
ALTER TABLE "AssistantSession" ADD COLUMN     "data" JSONB,
ADD COLUMN     "state" TEXT NOT NULL DEFAULT 'IDLE';
