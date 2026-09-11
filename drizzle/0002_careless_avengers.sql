-- The unique constraint has to exist before anything can reference it, so it
-- comes first. drizzle-kit emitted it last, which fails on a real database.
ALTER TABLE "workshop_day" ADD CONSTRAINT "workshop_day_tenant_workshop_id_uq" UNIQUE("tenant_id","workshop_id","id");--> statement-breakpoint
ALTER TABLE "cluster" DROP CONSTRAINT "cluster_tenant_id_day_id_workshop_day_tenant_id_id_fk";
--> statement-breakpoint
ALTER TABLE "module" DROP CONSTRAINT "module_tenant_id_day_id_workshop_day_tenant_id_id_fk";
--> statement-breakpoint
ALTER TABLE "cluster" ADD CONSTRAINT "cluster_tenant_id_workshop_id_day_id_workshop_day_tenant_id_workshop_id_id_fk" FOREIGN KEY ("tenant_id","workshop_id","day_id") REFERENCES "public"."workshop_day"("tenant_id","workshop_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module" ADD CONSTRAINT "module_tenant_id_workshop_id_day_id_workshop_day_tenant_id_workshop_id_id_fk" FOREIGN KEY ("tenant_id","workshop_id","day_id") REFERENCES "public"."workshop_day"("tenant_id","workshop_id","id") ON DELETE cascade ON UPDATE no action;
