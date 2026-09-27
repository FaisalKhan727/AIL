-- Composite indexes backed by real query patterns identified in a
-- performance audit: company-scoped list/dashboard queries that filter or
-- order by a second column alongside companyId, previously served by a
-- single-column companyId index plus a filter scan.

-- Guard: /api/guards list + dashboard onboarding groupBy filter on
-- (companyId, active).
CREATE INDEX "Guard_companyId_active_idx" ON "Guard"("companyId", "active");

-- ClockEvent: /api/live "recent activity" query filters on
-- (companyId, timestamp).
CREATE INDEX "ClockEvent_companyId_timestamp_idx" ON "ClockEvent"("companyId", "timestamp");

-- IncidentReport: /api/live open-incidents (ordered by occurredAt) and
-- recent-activity (ordered by createdAt) queries, both scoped by companyId.
CREATE INDEX "IncidentReport_companyId_createdAt_idx" ON "IncidentReport"("companyId", "createdAt");
CREATE INDEX "IncidentReport_companyId_occurredAt_idx" ON "IncidentReport"("companyId", "occurredAt");
