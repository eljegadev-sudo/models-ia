-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "currentState" TEXT;

-- AlterTable
ALTER TABLE "ModelProfile" ADD COLUMN     "countryOfResidence" TEXT,
ADD COLUMN     "timezone" TEXT DEFAULT 'America/New_York';

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "modelProfileId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "caption" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Story_modelProfileId_idx" ON "Story"("modelProfileId");

-- CreateIndex
CREATE INDEX "Story_expiresAt_idx" ON "Story"("expiresAt");

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_modelProfileId_fkey" FOREIGN KEY ("modelProfileId") REFERENCES "ModelProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
