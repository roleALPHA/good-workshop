-- ═══════════════════════════════════════════════════════════════════════════
-- Tells the collaboration server that somebody's access may just have changed.
--
-- The collaboration server checks a credential when a socket opens, and a
-- socket stays open for hours. Withdrawing an invitation, signing somebody out,
-- disabling a member, revoking a token or unsharing a workshop all happen in
-- the web process -- a different process, with no line to the socket. What the
-- two do share is this database, so the database is what says so.
--
-- Triggers rather than a call at every place that withdraws access: there are
-- a dozen such places today, the CLI is one of them, and the next one will be
-- written by somebody who has never read ws.ts.
--
-- The notification carries nothing. It is a nudge to go and ask again through
-- the normal access check, never an answer -- so there is no payload to trust,
-- to leak across tenants, or to get out of step with the rules. Postgres folds
-- identical notifications within one transaction into one, so a statement that
-- touches a thousand rows still wakes the server once.
--
-- The column lists matter. `last_seen_at` is written on every request and on
-- every re-check the server itself makes; a trigger on it would turn each
-- check into the next notification.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.gw_notify_access_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('gw_access_changed', '');
  RETURN NULL;
END;
$$;
--> statement-breakpoint

-- Sign-in material
CREATE TRIGGER auth_session_access_changed
  AFTER UPDATE OF revoked_at, expires_at OR DELETE ON auth_session
  FOR EACH STATEMENT EXECUTE FUNCTION public.gw_notify_access_changed();
--> statement-breakpoint
CREATE TRIGGER identity_access_changed
  AFTER UPDATE OF status OR DELETE ON identity
  FOR EACH STATEMENT EXECUTE FUNCTION public.gw_notify_access_changed();
--> statement-breakpoint
CREATE TRIGGER tenant_access_changed
  AFTER UPDATE OF status OR DELETE ON tenant
  FOR EACH STATEMENT EXECUTE FUNCTION public.gw_notify_access_changed();
--> statement-breakpoint
CREATE TRIGGER member_access_changed
  AFTER UPDATE OF status, role OR DELETE ON member
  FOR EACH STATEMENT EXECUTE FUNCTION public.gw_notify_access_changed();
--> statement-breakpoint

-- Tokens
CREATE TRIGGER personal_access_token_access_changed
  AFTER UPDATE OF revoked_at, expires_at, scopes OR DELETE ON personal_access_token
  FOR EACH STATEMENT EXECUTE FUNCTION public.gw_notify_access_changed();
--> statement-breakpoint
CREATE TRIGGER oauth_token_access_changed
  AFTER UPDATE OF revoked_at, expires_at, scopes OR DELETE ON oauth_token
  FOR EACH STATEMENT EXECUTE FUNCTION public.gw_notify_access_changed();
--> statement-breakpoint

-- Guests
CREATE TRIGGER workshop_share_link_access_changed
  AFTER UPDATE OF revoked_at, expires_at, role OR DELETE ON workshop_share_link
  FOR EACH STATEMENT EXECUTE FUNCTION public.gw_notify_access_changed();
--> statement-breakpoint
CREATE TRIGGER share_session_access_changed
  AFTER UPDATE OF revoked_at, expires_at OR DELETE ON share_session
  FOR EACH STATEMENT EXECUTE FUNCTION public.gw_notify_access_changed();
--> statement-breakpoint

-- Sharing. INSERT too: a workshop row pinned to viewer narrows what a folder
-- grant gave.
CREATE TRIGGER workshop_collaborator_access_changed
  AFTER INSERT OR UPDATE OR DELETE ON workshop_collaborator
  FOR EACH STATEMENT EXECUTE FUNCTION public.gw_notify_access_changed();
--> statement-breakpoint
CREATE TRIGGER folder_collaborator_access_changed
  AFTER INSERT OR UPDATE OR DELETE ON folder_collaborator
  FOR EACH STATEMENT EXECUTE FUNCTION public.gw_notify_access_changed();
--> statement-breakpoint

-- Where a workshop sits, and whether it still exists. A move between folders
-- changes what is inherited; a day's date moves a guest's deadline.
CREATE TRIGGER workshop_access_changed
  AFTER UPDATE OF owner_id, folder_id, deleted_at OR DELETE ON workshop
  FOR EACH STATEMENT EXECUTE FUNCTION public.gw_notify_access_changed();
--> statement-breakpoint
CREATE TRIGGER folder_access_changed
  AFTER UPDATE OF parent_id, ancestor_ids OR DELETE ON folder
  FOR EACH STATEMENT EXECUTE FUNCTION public.gw_notify_access_changed();
--> statement-breakpoint
CREATE TRIGGER workshop_day_access_changed
  AFTER UPDATE OF workshop_id, date OR DELETE ON workshop_day
  FOR EACH STATEMENT EXECUTE FUNCTION public.gw_notify_access_changed();
