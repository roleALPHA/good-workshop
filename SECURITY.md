# Security

## Reporting a vulnerability

**Please do not open a public issue.** Use GitHub's
[private vulnerability reporting](https://github.com/roleALPHA/good-workshop/security/advisories/new)
— it is enabled on this repository, and it gives us a place to talk before anything is public.

Tell us what you found, how to reach it, and what an attacker gets out of it. A proof of concept
helps; a sentence that explains the consequence helps more.

You will hear back within a week. If a report turns out to be valid we will agree a disclosure
date with you and credit you in the advisory unless you would rather we did not.

## What this product is, for the purposes of a report

GoodWorkshop is **self-hosted**. There is no service to compromise — every installation belongs
to whoever runs it, holds their data in their own Postgres, and is reachable at their own
hostname. A finding here is a finding in software other people deploy, which is the reason a
quiet report matters more than it would for a hosted product: the fix has to reach operators
before the details do.

## The boundaries worth attacking

These are the lines the architecture is built around. If you can cross one, that is a finding
even if nothing else looks broken:

- **The tenant boundary.** Row-level security, forced on every tenant-scoped table, is what keeps
  one organisation's data out of another's. `docs/architecture.md` explains why the boundary is
  in the database rather than in the application.
- **The workshop boundary.** Authorisation is in the application layer on purpose; a colleague
  who was never shared with must get "not found", from the same code path everybody else uses.
- **Folder grants.** They reach a whole subtree and workshops other people own, bounded by two
  rules: the nearest folder decides, and nobody hands on more than they hold.
- **Share links for guests.** A link grants exactly one workshop, creates no identity and no
  member, and its session cannot become a login — `share_session` has no `identity_id` column at
  all. Anything that turns a guest into an account is serious.
- **MCP tokens and OAuth.** A token acts as the person who made it and can never do more than
  that person can. There is deliberately no scope for user administration. An OAuth access token
  carries the audience it was issued for and must not work anywhere else.
- **The first-run setup screen.** It is gated by a key printed to the server log and disappears
  once an administrator exists. A way to reach it afterwards, or to claim an installation without
  the key, is a takeover.

## Not vulnerabilities

- A tenant administrator being able to see the data of their own tenant. That is the role.
- `GW_MAIL_TRANSPORT=console` printing working sign-in links into the log. It is documented as
  such, warned about at startup, and is the intended route for an installation with no relay.
- Missing rate limits on an endpoint behind a session, unless you can show what it costs.

## Supported versions

The latest release. This project is young and moves quickly; there is no back-porting yet.
