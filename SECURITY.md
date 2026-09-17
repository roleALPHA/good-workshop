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

## How a report is handled

So that the process is visible rather than promised:

1. **Acknowledged within a week**, through the private advisory thread.
2. **Assessed** — what an attacker gets, which versions are affected, whether it crosses one of
   the boundaries above.
3. **Fixed on a private fork** where the change is not public before the advisory is.
4. **Released** as a normal tagged release, with the advisory published at the same time and a
   CVE requested through GitHub where one is warranted.
5. **Credited** to you in the advisory unless you would rather we did not.

Because every installation is somebody else's, there is no "we patched production and you are
already safe". Operators have to pull an image, so the advisory says which version fixes it and
the release notes repeat it.

## Finding out what is in a release

You do not have to take our word for what a version contains:

- **`sbom.cdx.json`** is attached to every release — a CycloneDX document with the exact version
  of every dependency that went into it. Feed it to Dependency-Track, Grype or anything else
  that speaks CycloneDX.
- **The published image carries an SPDX attestation** of its own filesystem, readable without
  pulling it:

  ```bash
  docker buildx imagetools inspect ghcr.io/rolealpha/good-workshop:0.5.2 --format '{{ json .SBOM }}'
  ```

- **`THIRD-PARTY-LICENSES.txt`** ships inside the image and is attached to every release.

## Checking that an image is ours

Every published image is signed with a keyless [Sigstore](https://www.sigstore.dev/) signature
and carries a GitHub build attestation. Both name the workflow and the commit that built it, so
an image pushed by anybody else — with a stolen registry token, say — fails the check:

```bash
cosign verify ghcr.io/rolealpha/good-workshop:0.5.2 \
  --certificate-identity-regexp '^https://github\.com/roleALPHA/good-workshop/\.github/workflows/publish\.yml@' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com

gh attestation verify oci://ghcr.io/rolealpha/good-workshop:0.5.2 --repo roleALPHA/good-workshop
```

`cosign` needs to be version 3 or later: the signatures are stored in the Sigstore bundle
format, which version 2 does not look for and reports as "no signatures found". Releases before
0.5.2 carry neither a signature nor an attestation.

Dependabot, CodeQL (`security-extended`), dependency review and secret scanning with push
protection run on this repository. So do gitleaks over the whole git history, zizmor over the
workflows, osv-scanner over the lockfile, Grype over the built image, and the OpenSSF Scorecard.
CI runs the full suite nightly. That is how we find the
boring half; the interesting half comes from people like you.
