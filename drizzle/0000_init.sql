CREATE TABLE "audit_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid DEFAULT app.current_tenant() NOT NULL,
	"actor_member_id" uuid,
	"source" text NOT NULL,
	"token_id" uuid,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"action" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_source" CHECK ("audit_event"."source" in ('web','mcp','api','system'))
);
--> statement-breakpoint
ALTER TABLE "audit_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identity_id" uuid NOT NULL,
	"active_tenant_id" uuid,
	"secret_hash" text NOT NULL,
	"method" text NOT NULL,
	"user_agent" text,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "auth_session_method" CHECK ("auth_session"."method" in ('passkey','magic_link'))
);
--> statement-breakpoint
CREATE TABLE "cluster" (
	"id" uuid NOT NULL,
	"tenant_id" uuid DEFAULT app.current_tenant() NOT NULL,
	"workshop_id" uuid NOT NULL,
	"day_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"color" text,
	"json_desc" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" text NOT NULL,
	"pinned_start_time" time,
	"target_duration_minutes" integer,
	"collapsed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cluster_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "cluster_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "cluster_tenant_id_day_uq" UNIQUE("tenant_id","id","day_id"),
	CONSTRAINT "cluster_position_format" CHECK ("cluster"."position" ~ '^[0-9A-Za-z]{1,64}$'),
	CONSTRAINT "cluster_target_duration" CHECK ("cluster"."target_duration_minutes" is null or "cluster"."target_duration_minutes" between 0 and 1440)
);
--> statement-breakpoint
ALTER TABLE "cluster" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "email_token" (
	"id" uuid PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"email" "citext" NOT NULL,
	"identity_id" uuid,
	"tenant_id" uuid,
	"invited_role" text,
	"token_hash" text NOT NULL,
	"redirect_to" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"requested_ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_token_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "email_token_purpose" CHECK ("email_token"."purpose" in ('login','invite','email_change')),
	CONSTRAINT "email_token_invited_role" CHECK ("email_token"."invited_role" is null or "email_token"."invited_role" in ('member','admin'))
);
--> statement-breakpoint
CREATE TABLE "folder" (
	"id" uuid NOT NULL,
	"tenant_id" uuid DEFAULT app.current_tenant() NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"ancestor_ids" uuid[] DEFAULT '{}' NOT NULL,
	"position" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "folder_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "folder_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "folder_name_length" CHECK (length("folder"."name") between 1 and 120),
	CONSTRAINT "folder_depth" CHECK (cardinality("folder"."ancestor_ids") <= 7),
	CONSTRAINT "folder_no_self_cycle" CHECK (not ("folder"."ancestor_ids" @> array["folder"."id"]))
);
--> statement-breakpoint
ALTER TABLE "folder" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" "citext" NOT NULL,
	"email_verified_at" timestamp with time zone,
	"display_name" text DEFAULT '' NOT NULL,
	"avatar_url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"external_idp" text,
	"external_id" text,
	"locale" text DEFAULT 'de' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_email_unique" UNIQUE("email"),
	CONSTRAINT "identity_external_uq" UNIQUE("external_idp","external_id"),
	CONSTRAINT "identity_status" CHECK ("identity"."status" in ('active','disabled'))
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"identity_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"display_name" text,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "member_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "member_tenant_identity_uq" UNIQUE("tenant_id","identity_id"),
	CONSTRAINT "member_role" CHECK ("member"."role" in ('member','admin')),
	CONSTRAINT "member_status" CHECK ("member"."status" in ('invited','active','disabled'))
);
--> statement-breakpoint
ALTER TABLE "member" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "module_revision" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid DEFAULT app.current_tenant() NOT NULL,
	"module_id" uuid NOT NULL,
	"field" text NOT NULL,
	"old_value" jsonb,
	"actor_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "module_revision" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "module_type" (
	"id" uuid NOT NULL,
	"tenant_id" uuid DEFAULT app.current_tenant() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'content' NOT NULL,
	"color" text DEFAULT 'slate' NOT NULL,
	"icon" text DEFAULT 'square' NOT NULL,
	"default_duration_minutes" integer DEFAULT 15 NOT NULL,
	"counts_as_content" boolean DEFAULT true NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"json_schema" jsonb NOT NULL,
	"ui_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_json_desc" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"system_key" text,
	"system_revision" integer,
	"customized_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "module_type_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "module_type_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "module_type_tenant_key_uq" UNIQUE("tenant_id","key"),
	CONSTRAINT "module_type_key_format" CHECK ("module_type"."key" ~ '^[a-z][a-z0-9_]{1,48}$'),
	CONSTRAINT "module_type_category" CHECK ("module_type"."category" in ('opening','content','activity','logistics','closing','custom')),
	CONSTRAINT "module_type_duration" CHECK ("module_type"."default_duration_minutes" between 0 and 1440),
	CONSTRAINT "module_type_schema_size" CHECK (octet_length("module_type"."json_schema"::text) <= 32768),
	CONSTRAINT "module_type_system_key" CHECK ("module_type"."is_system" = false or "module_type"."system_key" is not null)
);
--> statement-breakpoint
ALTER TABLE "module_type" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "module_type_version" (
	"tenant_id" uuid DEFAULT app.current_tenant() NOT NULL,
	"module_type_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"json_schema" jsonb NOT NULL,
	"ui_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "module_type_version_module_type_id_version_pk" PRIMARY KEY("module_type_id","version")
);
--> statement-breakpoint
ALTER TABLE "module_type_version" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "personal_access_token" (
	"id" uuid NOT NULL,
	"tenant_id" uuid DEFAULT app.current_tenant() NOT NULL,
	"member_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{workshops:read}' NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_access_token_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "personal_access_token_token_id_unique" UNIQUE("token_id"),
	CONSTRAINT "pat_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "personal_access_token" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tag" (
	"id" uuid NOT NULL,
	"tenant_id" uuid DEFAULT app.current_tenant() NOT NULL,
	"name" "citext" NOT NULL,
	"color" text DEFAULT 'slate' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tag_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "tag_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "tag_tenant_name_uq" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
ALTER TABLE "tag" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" "citext" NOT NULL,
	"name" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"brand_name" text,
	"brand_hex" text,
	"logo" text,
	"logo_mime" text,
	"logo_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tenant_status" CHECK ("tenant"."status" in ('active','suspended')),
	CONSTRAINT "tenant_brand_hex" CHECK ("tenant"."brand_hex" is null or "tenant"."brand_hex" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "webauthn_challenge" (
	"id" uuid PRIMARY KEY NOT NULL,
	"challenge" text NOT NULL,
	"identity_id" uuid,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webauthn_challenge_purpose" CHECK ("webauthn_challenge"."purpose" in ('registration','authentication'))
);
--> statement-breakpoint
CREATE TABLE "webauthn_credential" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identity_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"sign_count" bigint DEFAULT 0 NOT NULL,
	"transports" text[] DEFAULT '{}' NOT NULL,
	"backed_up" boolean DEFAULT false NOT NULL,
	"device_type" text,
	"nickname" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "webauthn_credential_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "workshop" (
	"id" uuid NOT NULL,
	"tenant_id" uuid DEFAULT app.current_tenant() NOT NULL,
	"folder_id" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"owner_id" uuid NOT NULL,
	"timezone" text DEFAULT 'Europe/Berlin' NOT NULL,
	"json_desc" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" text NOT NULL,
	"content_version" bigint DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workshop_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "workshop_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "workshop_title_length" CHECK (length("workshop"."title") between 1 and 300),
	CONSTRAINT "workshop_status" CHECK ("workshop"."status" in ('draft','ready','delivered','archived'))
);
--> statement-breakpoint
ALTER TABLE "workshop" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workshop_collaborator" (
	"tenant_id" uuid DEFAULT app.current_tenant() NOT NULL,
	"workshop_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"role" text NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workshop_collaborator_workshop_id_member_id_pk" PRIMARY KEY("workshop_id","member_id"),
	CONSTRAINT "workshop_collaborator_role" CHECK ("workshop_collaborator"."role" in ('editor','viewer'))
);
--> statement-breakpoint
ALTER TABLE "workshop_collaborator" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workshop_day" (
	"id" uuid NOT NULL,
	"tenant_id" uuid DEFAULT app.current_tenant() NOT NULL,
	"workshop_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"date" date,
	"start_time" time DEFAULT '09:00' NOT NULL,
	"target_end_time" time,
	"timezone" text,
	"json_desc" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workshop_day_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "workshop_day_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "workshop_day" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "module" (
	"id" uuid NOT NULL,
	"tenant_id" uuid DEFAULT app.current_tenant() NOT NULL,
	"workshop_id" uuid NOT NULL,
	"day_id" uuid NOT NULL,
	"cluster_id" uuid,
	"module_type_id" uuid NOT NULL,
	"type_version" integer DEFAULT 1 NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"duration_minutes" integer DEFAULT 15 NOT NULL,
	"pinned_start_time" time,
	"json_desc" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" text NOT NULL,
	"parent_kind" text GENERATED ALWAYS AS (case when cluster_id is null then 'day' else 'cluster' end) STORED,
	"parent_id" uuid GENERATED ALWAYS AS (coalesce(cluster_id, day_id)) STORED,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "module_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "module_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "module_duration" CHECK ("module"."duration_minutes" between 0 and 1440),
	CONSTRAINT "module_position_format" CHECK ("module"."position" ~ '^[0-9A-Za-z]{1,64}$'),
	CONSTRAINT "module_desc_size" CHECK (octet_length("module"."json_desc"::text) <= 262144)
);
--> statement-breakpoint
ALTER TABLE "module" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workshop_share_link" (
	"id" uuid NOT NULL,
	"tenant_id" uuid DEFAULT app.current_tenant() NOT NULL,
	"workshop_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workshop_share_link_id_pk" PRIMARY KEY("id"),
	CONSTRAINT "workshop_share_link_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "share_link_role" CHECK ("workshop_share_link"."role" in ('viewer'))
);
--> statement-breakpoint
ALTER TABLE "workshop_share_link" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workshop_tag" (
	"tenant_id" uuid DEFAULT app.current_tenant() NOT NULL,
	"workshop_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workshop_tag_workshop_id_tag_id_pk" PRIMARY KEY("workshop_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "workshop_tag" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_identity_id_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_active_tenant_id_tenant_id_fk" FOREIGN KEY ("active_tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster" ADD CONSTRAINT "cluster_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster" ADD CONSTRAINT "cluster_tenant_id_workshop_id_workshop_tenant_id_id_fk" FOREIGN KEY ("tenant_id","workshop_id") REFERENCES "public"."workshop"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cluster" ADD CONSTRAINT "cluster_tenant_id_day_id_workshop_day_tenant_id_id_fk" FOREIGN KEY ("tenant_id","day_id") REFERENCES "public"."workshop_day"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_token" ADD CONSTRAINT "email_token_identity_id_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_token" ADD CONSTRAINT "email_token_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder" ADD CONSTRAINT "folder_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder" ADD CONSTRAINT "folder_tenant_id_parent_id_folder_tenant_id_id_fk" FOREIGN KEY ("tenant_id","parent_id") REFERENCES "public"."folder"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_identity_id_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_type" ADD CONSTRAINT "module_type_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_type_version" ADD CONSTRAINT "module_type_version_tenant_id_module_type_id_module_type_tenant_id_id_fk" FOREIGN KEY ("tenant_id","module_type_id") REFERENCES "public"."module_type"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_access_token" ADD CONSTRAINT "personal_access_token_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_access_token" ADD CONSTRAINT "personal_access_token_tenant_id_member_id_member_tenant_id_id_fk" FOREIGN KEY ("tenant_id","member_id") REFERENCES "public"."member"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webauthn_challenge" ADD CONSTRAINT "webauthn_challenge_identity_id_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webauthn_credential" ADD CONSTRAINT "webauthn_credential_identity_id_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop" ADD CONSTRAINT "workshop_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop" ADD CONSTRAINT "workshop_tenant_id_folder_id_folder_tenant_id_id_fk" FOREIGN KEY ("tenant_id","folder_id") REFERENCES "public"."folder"("tenant_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop" ADD CONSTRAINT "workshop_tenant_id_owner_id_member_tenant_id_id_fk" FOREIGN KEY ("tenant_id","owner_id") REFERENCES "public"."member"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_collaborator" ADD CONSTRAINT "workshop_collaborator_tenant_id_workshop_id_workshop_tenant_id_id_fk" FOREIGN KEY ("tenant_id","workshop_id") REFERENCES "public"."workshop"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_collaborator" ADD CONSTRAINT "workshop_collaborator_tenant_id_member_id_member_tenant_id_id_fk" FOREIGN KEY ("tenant_id","member_id") REFERENCES "public"."member"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_day" ADD CONSTRAINT "workshop_day_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_day" ADD CONSTRAINT "workshop_day_tenant_id_workshop_id_workshop_tenant_id_id_fk" FOREIGN KEY ("tenant_id","workshop_id") REFERENCES "public"."workshop"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module" ADD CONSTRAINT "module_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module" ADD CONSTRAINT "module_tenant_id_workshop_id_workshop_tenant_id_id_fk" FOREIGN KEY ("tenant_id","workshop_id") REFERENCES "public"."workshop"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module" ADD CONSTRAINT "module_tenant_id_day_id_workshop_day_tenant_id_id_fk" FOREIGN KEY ("tenant_id","day_id") REFERENCES "public"."workshop_day"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module" ADD CONSTRAINT "module_tenant_id_cluster_id_day_id_cluster_tenant_id_id_day_id_fk" FOREIGN KEY ("tenant_id","cluster_id","day_id") REFERENCES "public"."cluster"("tenant_id","id","day_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module" ADD CONSTRAINT "module_tenant_id_module_type_id_module_type_tenant_id_id_fk" FOREIGN KEY ("tenant_id","module_type_id") REFERENCES "public"."module_type"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_share_link" ADD CONSTRAINT "workshop_share_link_tenant_id_workshop_id_workshop_tenant_id_id_fk" FOREIGN KEY ("tenant_id","workshop_id") REFERENCES "public"."workshop"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_tag" ADD CONSTRAINT "workshop_tag_tenant_id_workshop_id_workshop_tenant_id_id_fk" FOREIGN KEY ("tenant_id","workshop_id") REFERENCES "public"."workshop"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_tag" ADD CONSTRAINT "workshop_tag_tenant_id_tag_id_tag_tenant_id_id_fk" FOREIGN KEY ("tenant_id","tag_id") REFERENCES "public"."tag"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_event" USING btree ("tenant_id","entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_recent_idx" ON "audit_event" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "auth_session_identity_idx" ON "auth_session" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "auth_session_expiry_idx" ON "auth_session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "cluster_day_order_idx" ON "cluster" USING btree ("tenant_id","day_id","position");--> statement-breakpoint
CREATE INDEX "cluster_workshop_idx" ON "cluster" USING btree ("tenant_id","workshop_id");--> statement-breakpoint
CREATE INDEX "email_token_rate_idx" ON "email_token" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "email_token_expiry_idx" ON "email_token" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "folder_sibling_name_uq" ON "folder" USING btree ("tenant_id",coalesce("parent_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("name"));--> statement-breakpoint
CREATE INDEX "folder_children_idx" ON "folder" USING btree ("tenant_id","parent_id","position");--> statement-breakpoint
CREATE INDEX "folder_subtree_idx" ON "folder" USING gin ("ancestor_ids");--> statement-breakpoint
CREATE INDEX "member_tenant_role_idx" ON "member" USING btree ("tenant_id","role");--> statement-breakpoint
CREATE INDEX "member_identity_idx" ON "member" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "module_revision_module_idx" ON "module_revision" USING btree ("tenant_id","module_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "module_type_system_uq" ON "module_type" USING btree ("tenant_id","system_key") WHERE is_system;--> statement-breakpoint
CREATE INDEX "pat_member_idx" ON "personal_access_token" USING btree ("tenant_id","member_id");--> statement-breakpoint
CREATE INDEX "webauthn_challenge_expiry_idx" ON "webauthn_challenge" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "webauthn_credential_identity_idx" ON "webauthn_credential" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "workshop_folder_idx" ON "workshop" USING btree ("tenant_id","folder_id","position") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "workshop_owner_idx" ON "workshop" USING btree ("tenant_id","owner_id") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "workshop_recent_idx" ON "workshop" USING btree ("tenant_id","updated_at") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "workshop_collaborator_member_idx" ON "workshop_collaborator" USING btree ("tenant_id","member_id");--> statement-breakpoint
CREATE INDEX "workshop_day_order_idx" ON "workshop_day" USING btree ("tenant_id","workshop_id","position");--> statement-breakpoint
CREATE INDEX "module_parent_order_idx" ON "module" USING btree ("tenant_id","parent_id","position");--> statement-breakpoint
CREATE INDEX "module_workshop_idx" ON "module" USING btree ("tenant_id","workshop_id");--> statement-breakpoint
CREATE INDEX "module_day_idx" ON "module" USING btree ("tenant_id","day_id");--> statement-breakpoint
CREATE INDEX "module_type_idx" ON "module" USING btree ("tenant_id","module_type_id");--> statement-breakpoint
CREATE INDEX "workshop_tag_by_tag_idx" ON "workshop_tag" USING btree ("tenant_id","tag_id");--> statement-breakpoint
CREATE POLICY "audit_tenant_isolation" ON "audit_event" AS PERMISSIVE FOR ALL TO "gw_app" USING (tenant_id = (select app.current_tenant())) WITH CHECK (tenant_id = (select app.current_tenant()));--> statement-breakpoint
CREATE POLICY "cluster_tenant_isolation" ON "cluster" AS PERMISSIVE FOR ALL TO "gw_app" USING (tenant_id = (select app.current_tenant())) WITH CHECK (tenant_id = (select app.current_tenant()));--> statement-breakpoint
CREATE POLICY "folder_tenant_isolation" ON "folder" AS PERMISSIVE FOR ALL TO "gw_app" USING (tenant_id = (select app.current_tenant())) WITH CHECK (tenant_id = (select app.current_tenant()));--> statement-breakpoint
CREATE POLICY "member_tenant_isolation" ON "member" AS PERMISSIVE FOR ALL TO "gw_app" USING (tenant_id = (select app.current_tenant())) WITH CHECK (tenant_id = (select app.current_tenant()));--> statement-breakpoint
CREATE POLICY "module_revision_tenant_isolation" ON "module_revision" AS PERMISSIVE FOR ALL TO "gw_app" USING (tenant_id = (select app.current_tenant())) WITH CHECK (tenant_id = (select app.current_tenant()));--> statement-breakpoint
CREATE POLICY "module_type_tenant_isolation" ON "module_type" AS PERMISSIVE FOR ALL TO "gw_app" USING (tenant_id = (select app.current_tenant())) WITH CHECK (tenant_id = (select app.current_tenant()));--> statement-breakpoint
CREATE POLICY "module_type_version_tenant_isolation" ON "module_type_version" AS PERMISSIVE FOR ALL TO "gw_app" USING (tenant_id = (select app.current_tenant())) WITH CHECK (tenant_id = (select app.current_tenant()));--> statement-breakpoint
CREATE POLICY "pat_tenant_isolation" ON "personal_access_token" AS PERMISSIVE FOR ALL TO "gw_app" USING (tenant_id = (select app.current_tenant())) WITH CHECK (tenant_id = (select app.current_tenant()));--> statement-breakpoint
CREATE POLICY "tag_tenant_isolation" ON "tag" AS PERMISSIVE FOR ALL TO "gw_app" USING (tenant_id = (select app.current_tenant())) WITH CHECK (tenant_id = (select app.current_tenant()));--> statement-breakpoint
CREATE POLICY "workshop_tenant_isolation" ON "workshop" AS PERMISSIVE FOR ALL TO "gw_app" USING (tenant_id = (select app.current_tenant())) WITH CHECK (tenant_id = (select app.current_tenant()));--> statement-breakpoint
CREATE POLICY "workshop_collaborator_tenant_isolation" ON "workshop_collaborator" AS PERMISSIVE FOR ALL TO "gw_app" USING (tenant_id = (select app.current_tenant())) WITH CHECK (tenant_id = (select app.current_tenant()));--> statement-breakpoint
CREATE POLICY "workshop_day_tenant_isolation" ON "workshop_day" AS PERMISSIVE FOR ALL TO "gw_app" USING (tenant_id = (select app.current_tenant())) WITH CHECK (tenant_id = (select app.current_tenant()));--> statement-breakpoint
CREATE POLICY "module_tenant_isolation" ON "module" AS PERMISSIVE FOR ALL TO "gw_app" USING (tenant_id = (select app.current_tenant())) WITH CHECK (tenant_id = (select app.current_tenant()));--> statement-breakpoint
CREATE POLICY "share_link_tenant_isolation" ON "workshop_share_link" AS PERMISSIVE FOR ALL TO "gw_app" USING (tenant_id = (select app.current_tenant())) WITH CHECK (tenant_id = (select app.current_tenant()));--> statement-breakpoint
CREATE POLICY "workshop_tag_tenant_isolation" ON "workshop_tag" AS PERMISSIVE FOR ALL TO "gw_app" USING (tenant_id = (select app.current_tenant())) WITH CHECK (tenant_id = (select app.current_tenant()));