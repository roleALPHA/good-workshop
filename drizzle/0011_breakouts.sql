-- ═══════════════════════════════════════════════════════════════════════════
-- Breakouts: a section whose strands run at the same time.
--
-- A strand IS a cluster -- mode='sequential' with parent_cluster_id naming the
-- breakout. The blocks keep hanging on module.cluster_id, so the generated
-- parent columns and the day-consistency FK on module stay exactly as they are.
--
-- "Exactly two levels" is guaranteed by the database, not by the application:
--   * a cluster with a parent is sequential           (cluster_nesting)
--   * its parent is parallel                          (cluster_parent_fk)
--   * so a parallel cluster never has a parent        (the two together)
-- parent_mode is the generated constant that lets the foreign key say the
-- second line at all.
--
-- The UNIQUE comes BEFORE the FK that references it. drizzle-kit emits it last,
-- which fails on a real database -- the same reordering as in 0002_careless_avengers.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "cluster" ADD COLUMN "mode" text DEFAULT 'sequential' NOT NULL;--> statement-breakpoint
ALTER TABLE "cluster" ADD COLUMN "parent_cluster_id" uuid;--> statement-breakpoint
ALTER TABLE "cluster" ADD COLUMN "parent_mode" text GENERATED ALWAYS AS (case when parent_cluster_id is null then null else 'parallel' end) STORED;--> statement-breakpoint
ALTER TABLE "cluster" ADD CONSTRAINT "cluster_mode" CHECK ("cluster"."mode" in ('sequential','parallel'));--> statement-breakpoint
ALTER TABLE "cluster" ADD CONSTRAINT "cluster_nesting" CHECK ("cluster"."parent_cluster_id" is null or "cluster"."mode" = 'sequential');--> statement-breakpoint
ALTER TABLE "cluster" ADD CONSTRAINT "cluster_tenant_id_day_mode_uq" UNIQUE("tenant_id","id","day_id","mode");--> statement-breakpoint
ALTER TABLE "cluster" ADD CONSTRAINT "cluster_parent_fk" FOREIGN KEY ("tenant_id","parent_cluster_id","day_id","parent_mode") REFERENCES "public"."cluster"("tenant_id","id","day_id","mode") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cluster_parent_order_idx" ON "cluster" USING btree ("tenant_id","parent_cluster_id","position");
