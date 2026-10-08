-- CreateTable
CREATE TABLE "game_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastPlayDate" TEXT,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "answered" INTEGER NOT NULL DEFAULT 0,
    "rounds" INTEGER NOT NULL DEFAULT 0,
    "badges" JSONB NOT NULL DEFAULT '{}',
    "stats" JSONB NOT NULL DEFAULT '{}',
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_rounds" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classArmId" TEXT,
    "game" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'SERVER',
    "subject" TEXT,
    "playDate" TEXT NOT NULL,
    "dailyKey" TEXT,
    "clientId" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "answers" JSONB NOT NULL DEFAULT '[]',
    "correct" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "lives" INTEGER,
    "durationMs" INTEGER,
    "topics" JSONB NOT NULL DEFAULT '{}',
    "flagged" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "game_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "game_profiles_studentId_key" ON "game_profiles"("studentId");

-- CreateIndex
CREATE INDEX "game_profiles_tenantId_idx" ON "game_profiles"("tenantId");

-- CreateIndex
CREATE INDEX "game_rounds_tenantId_playDate_idx" ON "game_rounds"("tenantId", "playDate");

-- CreateIndex
CREATE INDEX "game_rounds_studentId_playDate_idx" ON "game_rounds"("studentId", "playDate");

-- CreateIndex
CREATE INDEX "game_rounds_classArmId_playDate_idx" ON "game_rounds"("classArmId", "playDate");

-- CreateIndex
CREATE UNIQUE INDEX "game_rounds_studentId_dailyKey_key" ON "game_rounds"("studentId", "dailyKey");

-- CreateIndex
CREATE UNIQUE INDEX "game_rounds_studentId_clientId_key" ON "game_rounds"("studentId", "clientId");
