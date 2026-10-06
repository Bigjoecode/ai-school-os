-- CreateTable
CREATE TABLE "jamb_institutions" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT,
    "state" TEXT,
    "address" TEXT,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "ownership" TEXT,
    "accreditation" TEXT,
    "modeOfStudy" TEXT,
    "specialization" TEXT,
    "programmeCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "jamb_institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jamb_programmes" (
    "id" INTEGER NOT NULL,
    "institutionId" INTEGER NOT NULL,
    "courseId" INTEGER,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "utmeSubjectsTextId" INTEGER,
    "olevelTextId" INTEGER,
    "directEntryTextId" INTEGER,
    "remarksTextId" INTEGER,
    "duration" TEXT,
    "status" TEXT,
    "accreditation" TEXT,
    "modeOfStudy" TEXT,

    CONSTRAINT "jamb_programmes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jamb_texts" (
    "id" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "jamb_texts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jamb_courses" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "faculty" TEXT,
    "level" TEXT,
    "institutionCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "jamb_courses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jamb_institutions_type_idx" ON "jamb_institutions"("type");

-- CreateIndex
CREATE INDEX "jamb_institutions_state_idx" ON "jamb_institutions"("state");

-- CreateIndex
CREATE INDEX "jamb_programmes_courseId_idx" ON "jamb_programmes"("courseId");

-- CreateIndex
CREATE INDEX "jamb_programmes_institutionId_idx" ON "jamb_programmes"("institutionId");

-- CreateIndex
CREATE INDEX "jamb_programmes_name_idx" ON "jamb_programmes"("name");

-- CreateIndex
CREATE INDEX "jamb_courses_name_idx" ON "jamb_courses"("name");

-- CreateIndex
CREATE INDEX "jamb_courses_faculty_idx" ON "jamb_courses"("faculty");

-- AddForeignKey
ALTER TABLE "jamb_programmes" ADD CONSTRAINT "jamb_programmes_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "jamb_institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
