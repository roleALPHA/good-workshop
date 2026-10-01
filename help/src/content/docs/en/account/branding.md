---
title: Branding
description: Set your workspace's logo, name and accent color – and the limits that apply.
sidebar:
  order: 4
---

Branding gives GoodWorkshop your organization's face: a logo and an accent color. Nothing more,
and that's intentional. The footer stays as it is, and the block types' colors are left
untouched.

Open the account menu at the top right and choose **Branding** under **Administration**.

:::note
Only admins can change the branding. It applies to everyone in the workspace.
:::

## Upload a logo

1. Under **Logo**, click **Upload a logo** (or **Replace the logo** if there already is one).
2. Choose the file.

The logo appears in the header. **Remove** takes it away again.

| Limit   | Value            |
| ------- | ---------------- |
| Formats | SVG, PNG or WebP |
| Size    | at most 256 KB   |

:::tip
An SVG stays sharp at any size and is usually the smallest. Watch out for three things when
exporting it, or GoodWorkshop will refuse the file:

- no scripts and no interactivity – many programs call that “plain SVG”,
- no external references – fonts and images embedded,
- no DTD and no entities.
  :::

Where else the logo shows up depends on the installation: if you run GoodWorkshop yourself, you
also see it on the sign-in page. In GoodWorkshop Cloud, the sign-in page shows no workspace
logo, because before signing in it isn't yet clear which workspace someone belongs to.

## A name instead of a logo

If you have no logo, enter the name that should appear in the header under
**Name (when no logo is set)**. If a logo is set, the header shows the logo.

## Set the accent color

The accent color tints the buttons and highlighted areas of the interface.

1. Under **Accent colour**, enter a **Hex value**, such as `#7c3aed`.
2. Press Enter or leave the field. GoodWorkshop saves immediately and shows **Saved.**

There is no separate save button here; the same goes for the name.

From that one color value, the server builds all the shades for light and dark mode. While
doing so, it checks the contrast. It refuses a color that would make text unreadable and tells
you why:

| Message                                                 | What to do                                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| “Grey has no hue to build an accent colour from …”      | Pick a colorful shade. No accent color can be built from gray, black or white.           |
| “In light (or dark) mode this shade only reaches …:1 …” | The contrast is below 4.5:1. Pick a slightly darker or stronger shade of the same color. |
| “Please give a colour as a hex value …”                 | The value isn't a hex value. Write it with `#` and six digits.                           |

GoodWorkshop slightly tones down very strong colors without asking, so that they work as an
accent and don't glare. Your input still remains the basis.

:::note[Why the block types keep their colors]
The block types' colors mean something – a break looks like a break. If the house color painted
over all types, the agenda would no longer be readable. So the colors belong to the block type
and cannot be changed here; which type plays which role is described under
[Blocks and block types](/en/agenda/blocks/).
:::

## See also

- [Members](/en/account/members/)
- [Mail delivery](/en/account/mail/)
- [Print](/en/sharing/print/)
