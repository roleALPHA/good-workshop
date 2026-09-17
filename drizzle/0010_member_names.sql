-- ═══════════════════════════════════════════════════════════════════════════
-- Members get a first and a last name.
--
-- Nothing ever wrote `member.display_name` or `identity.display_name`, so on
-- almost every installation there is nothing to carry over. Where somebody set
-- one by hand, it is split at the last space: "Anna Maria Berger" becomes
-- "Anna Maria" / "Berger", a single word becomes the first name. The membership
-- wins over the identity, the same order the application read them in.
--
-- identity.display_name stays: it is a column on the global auth table, and
-- nothing reads it any more.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "member" ADD COLUMN "first_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "last_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_first_name_length" CHECK (length("member"."first_name") <= 100);--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_last_name_length" CHECK (length("member"."last_name") <= 100);--> statement-breakpoint
WITH source AS (
  SELECT m.id,
         left(btrim(regexp_replace(coalesce(nullif(btrim(m.display_name), ''), i.display_name, ''), '\s+', ' ', 'g')), 201) AS name
    FROM "member" m
    JOIN "identity" i ON i.id = m.identity_id
)
UPDATE "member" m
   SET first_name = left(CASE WHEN position(' ' IN s.name) = 0 THEN s.name
                              ELSE regexp_replace(s.name, ' [^ ]*$', '') END, 100),
       last_name  = left(CASE WHEN position(' ' IN s.name) = 0 THEN ''
                              ELSE regexp_replace(s.name, '^.* ', '') END, 100)
  FROM source s
 WHERE s.id = m.id AND s.name <> '';--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "display_name";
