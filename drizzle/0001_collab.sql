CREATE TABLE "collab_state" (
	"tenant_id" uuid DEFAULT app.current_tenant() NOT NULL,
	"day_id" uuid NOT NULL,
	"materialized_up_to" bigint DEFAULT 0 NOT NULL,
	"materialized_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collab_state_day_id_pk" PRIMARY KEY("day_id")
);
--> statement-breakpoint
ALTER TABLE "collab_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "collab_update" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid DEFAULT app.current_tenant() NOT NULL,
	"day_id" uuid NOT NULL,
	"payload" "bytea" NOT NULL,
	"is_snapshot" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collab_update" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "collab_state" ADD CONSTRAINT "collab_state_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_state" ADD CONSTRAINT "collab_state_tenant_id_day_id_workshop_day_tenant_id_id_fk" FOREIGN KEY ("tenant_id","day_id") REFERENCES "public"."workshop_day"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_update" ADD CONSTRAINT "collab_update_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collab_update" ADD CONSTRAINT "collab_update_tenant_id_day_id_workshop_day_tenant_id_id_fk" FOREIGN KEY ("tenant_id","day_id") REFERENCES "public"."workshop_day"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collab_update_replay_idx" ON "collab_update" USING btree ("tenant_id","day_id","id");--> statement-breakpoint
CREATE POLICY "collab_state_tenant_isolation" ON "collab_state" AS PERMISSIVE FOR ALL TO "gw_app" USING (tenant_id = (select app.current_tenant())) WITH CHECK (tenant_id = (select app.current_tenant()));--> statement-breakpoint
CREATE POLICY "collab_update_tenant_isolation" ON "collab_update" AS PERMISSIVE FOR ALL TO "gw_app" USING (tenant_id = (select app.current_tenant())) WITH CHECK (tenant_id = (select app.current_tenant()));