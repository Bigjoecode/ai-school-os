-- Performance: indexes for hot query paths (see DEPLOYMENT.md, "Capacity").

-- CreateIndex: success dashboard, sign-ins per school over a period
CREATE INDEX "auth_sessions_tenantId_createdAt_idx" ON "auth_sessions"("tenantId", "createdAt");

-- CreateIndex: the signed-in student's record (every student request)
CREATE INDEX "students_userId_idx" ON "students"("userId");

-- CreateIndex: the signed-in parent's guardian records (consent check, family pages)
CREATE INDEX "guardians_userId_idx" ON "guardians"("userId");

-- CreateIndex: success dashboard, active students per school over a period
CREATE INDEX "practice_attempts_tenantId_startedAt_idx" ON "practice_attempts"("tenantId", "startedAt");

-- CreateIndex: the per-minute sweep that hands in timed-out online exam attempts
CREATE INDEX "online_exam_attempts_status_endsAt_idx" ON "online_exam_attempts"("status", "endsAt");

-- CreateIndex: success dashboard, mastery evidence per school over a period
CREATE INDEX "mastery_evidence_tenantId_createdAt_idx" ON "mastery_evidence"("tenantId", "createdAt");
