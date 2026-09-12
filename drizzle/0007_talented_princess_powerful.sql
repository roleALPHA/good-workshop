CREATE TABLE "oauth_client" (
	"id" uuid NOT NULL,
	"tenant_id" uuid DEFAULT app.current_tenant() NOT NULL,
	"client_key" text NOT NULL,
	"secret_hash" text,
	"name" text NOT NULL,
	"redirect_uris" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_client_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "oauth_client_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "oauth_client_key_uq" UNIQUE("tenant_id","client_key"),
	CONSTRAINT "oauth_client_redirects" CHECK (cardinality("oauth_client"."redirect_uris") between 1 and 10)
);
--> statement-breakpoint
ALTER TABLE "oauth_client" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "oauth_grant" (
	"id" uuid NOT NULL,
	"tenant_id" uuid DEFAULT app.current_tenant() NOT NULL,
	"code_hash" text NOT NULL,
	"client_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"scopes" text[] NOT NULL,
	"resource" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_grant_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "oauth_grant_code_uq" UNIQUE("code_hash"),
	CONSTRAINT "oauth_grant_challenge" CHECK (length("oauth_grant"."code_challenge") between 43 and 128)
);
--> statement-breakpoint
ALTER TABLE "oauth_grant" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "oauth_token" (
	"id" uuid NOT NULL,
	"tenant_id" uuid DEFAULT app.current_tenant() NOT NULL,
	"token_key" text NOT NULL,
	"secret_hash" text NOT NULL,
	"kind" text NOT NULL,
	"client_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"scopes" text[] NOT NULL,
	"resource" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_token_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "oauth_token_key_uq" UNIQUE("token_key"),
	CONSTRAINT "oauth_token_kind" CHECK ("oauth_token"."kind" in ('access','refresh'))
);
--> statement-breakpoint
ALTER TABLE "oauth_token" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "oauth_client" ADD CONSTRAINT "oauth_client_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_grant" ADD CONSTRAINT "oauth_grant_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_grant" ADD CONSTRAINT "oauth_grant_tenant_id_client_id_oauth_client_tenant_id_id_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."oauth_client"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_grant" ADD CONSTRAINT "oauth_grant_tenant_id_member_id_member_tenant_id_id_fk" FOREIGN KEY ("tenant_id","member_id") REFERENCES "public"."member"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_token" ADD CONSTRAINT "oauth_token_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_token" ADD CONSTRAINT "oauth_token_tenant_id_client_id_oauth_client_tenant_id_id_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."oauth_client"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_token" ADD CONSTRAINT "oauth_token_tenant_id_member_id_member_tenant_id_id_fk" FOREIGN KEY ("tenant_id","member_id") REFERENCES "public"."member"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_grant_expiry_idx" ON "oauth_grant" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "oauth_token_member_idx" ON "oauth_token" USING btree ("tenant_id","member_id");--> statement-breakpoint
CREATE INDEX "oauth_token_expiry_idx" ON "oauth_token" USING btree ("expires_at");--> statement-breakpoint
CREATE POLICY "oauth_client_tenant_isolation" ON "oauth_client" AS PERMISSIVE FOR ALL TO "gw_app" USING (tenant_id = (select app.current_tenant())) WITH CHECK (tenant_id = (select app.current_tenant()));--> statement-breakpoint
CREATE POLICY "oauth_grant_tenant_isolation" ON "oauth_grant" AS PERMISSIVE FOR ALL TO "gw_app" USING (tenant_id = (select app.current_tenant())) WITH CHECK (tenant_id = (select app.current_tenant()));--> statement-breakpoint
CREATE POLICY "oauth_token_tenant_isolation" ON "oauth_token" AS PERMISSIVE FOR ALL TO "gw_app" USING (tenant_id = (select app.current_tenant())) WITH CHECK (tenant_id = (select app.current_tenant()));