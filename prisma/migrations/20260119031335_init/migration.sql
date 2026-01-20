-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'Player 1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cost" REAL NOT NULL,
    "format" TEXT NOT NULL,
    "drawDays" TEXT NOT NULL,
    "drawTime" TEXT NOT NULL,
    "minLeadMinutes" INTEGER NOT NULL DEFAULT 30
);

-- CreateTable
CREATE TABLE "HistoricalDraw" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "drawAt" DATETIME NOT NULL,
    "numbers" TEXT NOT NULL,
    "bonus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HistoricalDraw_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GenerationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "computedAtUtc" DATETIME NOT NULL,
    "computedAtLocal" DATETIME NOT NULL,
    "tithiIndex" INTEGER,
    "nakshatraIndex" INTEGER,
    "phase" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GeneratedCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "intendedDrawAt" DATETIME NOT NULL,
    "numbers" TEXT NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "eligibilityReason" TEXT,
    "modifierApplied" BOOLEAN NOT NULL DEFAULT false,
    "modifierBefore" TEXT,
    "modifierAfter" TEXT,
    "modifierRepairSteps" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedCandidate_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GeneratedCandidate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "GenerationEvent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OfficialDraw" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "drawAt" DATETIME NOT NULL,
    "numbers" TEXT NOT NULL,
    "bonus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfficialDraw_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "officialDrawId" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "matchCountMain" INTEGER NOT NULL,
    "matchCountBonus" INTEGER NOT NULL,
    "matchCountGrand" INTEGER,
    "category" TEXT,
    "prizeValue" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Evaluation_officialDrawId_fkey" FOREIGN KEY ("officialDrawId") REFERENCES "OfficialDraw" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Evaluation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "GeneratedCandidate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "Game_slug_key" ON "Game"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationEvent_type_computedAtUtc_key" ON "GenerationEvent"("type", "computedAtUtc");

-- CreateIndex
CREATE INDEX "GeneratedCandidate_gameId_intendedDrawAt_strategy_eligible_idx" ON "GeneratedCandidate"("gameId", "intendedDrawAt", "strategy", "eligible");

-- CreateIndex
CREATE UNIQUE INDEX "OfficialDraw_gameId_drawAt_key" ON "OfficialDraw"("gameId", "drawAt");

-- CreateIndex
CREATE UNIQUE INDEX "Evaluation_officialDrawId_strategy_key" ON "Evaluation"("officialDrawId", "strategy");
