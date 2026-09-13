# Contributing

Everything about _how_ to build and test this project is in the
[README](README.md#contributing) and in [`docs/`](docs/). This file is the other half: the
terms a contribution arrives under, and the one mechanical step that records them.

## The licence your contribution is under

GoodWorkshop is **AGPL-3.0-only**. A contribution merged here is distributed under that licence
to everyone who receives the software, including everyone who reaches it over a network.

You keep the copyright in what you write. There is no copyright assignment and no CLA — we do
not ask you to sign your rights over to roleALPHA. The practical consequence, stated plainly
because it is easy to discover too late: this project therefore **cannot** be relicensed, dual
licensed or offered under a commercial licence without asking every contributor individually.
That is a deliberate trade. It keeps the barrier to contributing at zero and closes off a
business model, and we would rather have the contributors.

## Sign your work — the Developer Certificate of Origin

Every commit needs a `Signed-off-by` line. This is the
[Developer Certificate of Origin](https://developercertificate.org/), the same lightweight
mechanism the Linux kernel uses. It is not a contract and it does not transfer anything. It is
you stating that you are allowed to contribute the code you are contributing.

Git writes the line for you:

```bash
git commit -s -m "Your message"
```

To sign off work you have already committed:

```bash
git rebase --signoff main
```

CI checks this on every pull request and tells you exactly which commits are missing it. Commits
made by bots are exempt — Dependabot cannot certify anything.

### What you are certifying

By signing off you certify the following (DCO 1.1, verbatim):

> By making a contribution to this project, I certify that:
>
> **(a)** The contribution was created in whole or in part by me and I have the right to submit
> it under the open source license indicated in the file; or
>
> **(b)** The contribution is based upon previous work that, to the best of my knowledge, is
> covered under an appropriate open source license and I have the right under that license to
> submit that work with modifications, whether created in whole or in part by me, under the same
> open source license (unless I am permitted to submit under a different license), as indicated
> in the file; or
>
> **(c)** The contribution was provided directly to me by some other person who certified (a),
> (b) or (c) and I have not modified it.
>
> **(d)** I understand and agree that this project and the contribution are public and that a
> record of the contribution (including all personal information I submit with it, including my
> sign-off) is maintained indefinitely and may be redistributed consistent with this project or
> the open source license(s) involved.

Note what (d) means for your privacy: your name and email address become a permanent, public
part of the git history and cannot be removed later. Use an address you are willing to have
published. GitHub's `@users.noreply.github.com` address is fine and is what most people use.

### Code you did not write yourself

Two cases come up often enough to name:

- **Code from another project.** Fine under (b), if its licence is compatible with AGPL-3.0 —
  see the policy in [`scripts/licenses.mjs`](scripts/licenses.mjs). Say where it came from in
  the commit message and keep its copyright header.
- **Code an AI assistant generated.** You are the contributor and you sign off on it: (a) covers
  it, and the responsibility for it being yours to give is yours. Review it like any other code
  before you put your name on it.

## New dependencies

A new dependency is a legal decision as much as a technical one, because it ends up inside an
image other people run. CI fails if its licence is not in the allowlist in
[`scripts/licenses.mjs`](scripts/licenses.mjs), and the index in
[`THIRD-PARTY-LICENSES.md`](THIRD-PARTY-LICENSES.md) has to be regenerated:

```bash
pnpm licenses:write
```

The diff that produces is the review. If the licence is genuinely fine and simply not in the
allowlist yet, add it there **with the reason** — an entry without one is what the file exists
to prevent.

## Security

Do not open a public issue for a vulnerability. [SECURITY.md](SECURITY.md) has the private
reporting route and what a useful report contains.
