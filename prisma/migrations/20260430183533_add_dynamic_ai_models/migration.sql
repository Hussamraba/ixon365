-- AlterTable
ALTER TABLE "AIModel" ADD COLUMN     "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "endpoint" TEXT,
ADD COLUMN     "inputTypes" TEXT[] DEFAULT ARRAY['text']::TEXT[];

-- CreateTable
CREATE TABLE "CustomModelRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "detectedNeed" TEXT NOT NULL,
    "inputType" TEXT NOT NULL DEFAULT 'text',
    "language" TEXT NOT NULL DEFAULT 'mixed',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomModelRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CustomModelRequest" ADD CONSTRAINT "CustomModelRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
