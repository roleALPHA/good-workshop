-- Guest access to one workshop: workshop_share_link gets the invited address and
-- an editor role, share_session gives the guest a session that cannot name an
-- identity.
--
-- REORDERED BY HAND, for the same reason 0002 was. drizzle emitted
-- share_session's composite FK onto workshop_share_link(tenant_id, id) BEFORE
-- the UNIQUE it references, and Postgres rejects a foreign key whose target has
-- no unique constraint. Generated order fails on a real database; this one does
-- not. Regenerating this file will reintroduce it.
ALTER TABLE "workshop_share_link" ADD CONSTRAINT "share_link_tenant_id_uq" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "workshop_share_link" ADD CONSTRAINT "workshop_share_link_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- `email` is NOT NULL with no default, which is only safe because this table has
-- never had a writer: it shipped in 0000_init as "reserved but unbuilt" and no
-- code path has ever inserted into it. An installation that somehow carries rows
-- here would fail this statement rather than get a column full of guesses --
-- which is the right failure, and scripts/preflight.mjs names it beforehand.
ALTER TABLE "workshop_share_link" ADD COLUMN "email" "citext" NOT NULL;--> statement-breakpoint
ALTER TABLE "workshop_share_link" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workshop_share_link" DROP CONSTRAINT "share_link_role";--> statement-breakpoint
ALTER TABLE "workshop_share_link" ADD CONSTRAINT "share_link_role" CHECK ("workshop_share_link"."role" in ('viewer','editor'));--> statement-breakpoint
ALTER TABLE "workshop_share_link" ADD CONSTRAINT "share_link_workshop_email_uq" UNIQUE("tenant_id","workshop_id","email");--> statement-breakpoint
CREATE INDEX "share_link_workshop_idx" ON "workshop_share_link" USING btree ("tenant_id","workshop_id");--> statement-breakpoint

CREATE TABLE "share_session" (
	"id" uuid NOT NULL,
	"tenant_id" uuid DEFAULT app.current_tenant() NOT NULL,
	"share_link_id" uuid NOT NULL,
	"secret_hash" text NOT NULL,
	"user_agent" text,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "share_session_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "share_session_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "share_session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "share_session" ADD CONSTRAINT "share_session_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_session" ADD CONSTRAINT "share_session_tenant_id_share_link_id_workshop_share_link_tenant_id_id_fk" FOREIGN KEY ("tenant_id","share_link_id") REFERENCES "public"."workshop_share_link"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_session_link_idx" ON "share_session" USING btree ("tenant_id","share_link_id");--> statement-breakpoint
CREATE INDEX "share_session_expiry_idx" ON "share_session" USING btree ("expires_at");--> statement-breakpoint
CREATE POLICY "share_session_tenant_isolation" ON "share_session" AS PERMISSIVE FOR ALL TO "gw_app" USING (tenant_id = (select app.current_tenant())) WITH CHECK (tenant_id = (select app.current_tenant()));
