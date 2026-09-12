CREATE TABLE "folder_collaborator" (
	"tenant_id" uuid DEFAULT app.current_tenant() NOT NULL,
	"folder_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"role" text NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "folder_collaborator_folder_id_member_id_pk" PRIMARY KEY("folder_id","member_id"),
	CONSTRAINT "folder_collaborator_role" CHECK ("folder_collaborator"."role" in ('editor','viewer'))
);
--> statement-breakpoint
ALTER TABLE "folder_collaborator" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "folder_collaborator" ADD CONSTRAINT "folder_collaborator_tenant_id_folder_id_folder_tenant_id_id_fk" FOREIGN KEY ("tenant_id","folder_id") REFERENCES "public"."folder"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder_collaborator" ADD CONSTRAINT "folder_collaborator_tenant_id_member_id_member_tenant_id_id_fk" FOREIGN KEY ("tenant_id","member_id") REFERENCES "public"."member"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "folder_collaborator_member_idx" ON "folder_collaborator" USING btree ("tenant_id","member_id");--> statement-breakpoint
CREATE INDEX "folder_collaborator_folder_idx" ON "folder_collaborator" USING btree ("tenant_id","folder_id");--> statement-breakpoint
CREATE POLICY "folder_collaborator_tenant_isolation" ON "folder_collaborator" AS PERMISSIVE FOR ALL TO "gw_app" USING (tenant_id = (select app.current_tenant())) WITH CHECK (tenant_id = (select app.current_tenant()));