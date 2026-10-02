---
title: Export as Markdown
description: Download a day or the whole workshop as a Markdown file – to paste into a wiki, notes or an e-mail, or to pass on.
sidebar:
  order: 4
---

Every agenda can be downloaded as a Markdown file at any time. Markdown is plain text with a few characters for headings and tables. You can paste it into a wiki, a notes tool, a ticket or an e-mail, and a table stays a table.

## Export in three steps

1. Open a day of the workshop.
2. Use the two checkboxes at the top right to decide what comes along:
   - **Whole workshop** – all days in one file instead of only the open one.
   - **With facilitator notes** – your notes on the blocks.
3. Click **Markdown**. Your browser downloads a `.md` file, named after the workshop.

Both checkboxes also apply to [printing](/en/sharing/print/) – they answer the same question: who is this copy for?

:::caution[Notes are left out by default]
Fields that a block type marks as private – currently the facilitator notes – are only in the file with **With facilitator notes**. The checkbox is off every time you open the page. Don't pass a file with notes on to participants.
:::

## What's in the file

**At the top, a header section** with information for tools that read Markdown metadata: title, date (a list of dates for several days) and total duration. For the whole workshop, the folder path (only the folders you have access to), the [tags](/en/library/tags/) and the number of days are added.

**Then the title** of the workshop as a heading. For the whole workshop, each day follows under its own heading: its name, otherwise its date, otherwise “Day 1”, “Day 2” …

**A summary for each day**: name, date, start and end, and the split, for example “5h 30m content, 1h 15m breaks”.

**Below that, the schedule as a table** with the columns Time, Duration, Block and Info:

| Column   | Content                                                                                |
| -------- | -------------------------------------------------------------------------------------- |
| Time     | Start time; 🔒 for a [fixed start time](/en/agenda/timing/)                            |
| Duration | Duration of the block or section                                                       |
| Block    | Title; [sections](/en/agenda/clusters-and-breakouts/) in bold, indented entries with ↳ |
| Info     | Responsible, block type, and “⚠ Overlap” where applicable                              |

For a breakout, the Info column shows the number of strands with the note “parallel”, and for each strand “Strand 1 of 3”. That makes it clear why the same time appears more than once.

**Finally, a “Details” section** with the description and the other fields of each block – materials, format and whatever else the block type brings – each with its label from the app.

At the very bottom is a line pointing to GoodWorkshop.

:::note[What isn't exported]
Blocks in the [parking area](/en/agenda/parking/) aren't in the schedule and therefore aren't in the file either.
:::

## One day or the whole workshop

| Selection                  | Result                                                                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| without **Whole workshop** | One file with the open day.                                                                                                                                                         |
| with **Whole workshop**    | One file with all days in their order – not an archive of separate files. A workshop without days results in a file with the title and the sentence “This workshop has no day yet.” |

## Language of the file

The file is written in the language you have set in your [profile](/en/account/profile-and-language/): column names, block types and field labels. Your own texts – titles, descriptions – stay the way you wrote them.

:::tip[Export for another language]
If you need the agenda for participants in another language, add `?locale=en` to the download address (or `fr`, `es`, `de`); if there is already a `?` in it, use `&locale=en`. You don't need to change your profile for that.
:::

## Who may export

Every member who may see the workshop can export it – with **Read**, **Edit** or as **Owner**. Guests with a [share link](/en/sharing/share-links/) can't export.

The export also works when your workspace is read-only or blocked over an unpaid invoice. Your content always comes out.

:::tip[Export through the AI assistant]
A [connected AI assistant](/en/ai/introduction/) gets the same text with the `export_workshop` tool – handy when it should summarize, translate or turn the workshop into an e-mail. See [Examples](/en/ai/examples/).
:::

## See also

- [Print](/en/sharing/print/) – the same schedule on paper or as a PDF
- [Sections and breakouts](/en/agenda/clusters-and-breakouts/)
- [Responsible people](/en/agenda/responsible/)
- [Tool reference](/en/ai/tools/)
