---
title: Tool reference
description: Every tool GoodWorkshop's MCP server offers an AI assistant – with its purpose, important parameters and the scope it needs.
sidebar:
  order: 3
---

This page lists every tool GoodWorkshop offers a connected assistant. You don't have to call the tools yourself – the assistant picks them based on your request. The reference helps you judge what's possible and follow an assistant's answer.

Tool names, parameters and descriptions are in English, because they are written for the model. You can phrase your requests in any language.

## How to read this page

**Scope** says which permission the tool needs (see [Connect an assistant](/en/ai/connect/)):

| Abbreviation | Scope                                      |
| ------------ | ------------------------------------------ |
| R            | **Read workshops** (`workshops:read`)      |
| W            | **Write workshops** (`workshops:write`)    |
| T            | **Read block types** (`module_types:read`) |

Your own rights on the workshop always apply on top: what you may only read, the assistant can't change either.

**Times** are minutes since midnight: `540` is 9:00 AM. **Durations** are minutes.

**IDs** are long identifiers that the assistant takes from earlier answers, for example from `list_workshops` or `get_workshop`.

**`expectedVersion`** is accepted by every tool that changes the content of a day. The assistant sends the version it last read. If the workshop has changed since then – for example because you're editing in parallel – the change is refused instead of overwriting your work.

## Library and folders

| Tool            | What it does                                                                            | Important parameters                      | Scope |
| --------------- | --------------------------------------------------------------------------------------- | ----------------------------------------- | ----- |
| `list_folders`  | Returns the folder tree in display order – only the folders you have access to.         | –                                         | R     |
| `create_folder` | Creates a folder, at the top or inside another folder. Names are unique among siblings. | `name`, `parentId`                        | W     |
| `move_folder`   | Moves a folder with its contents. Workspace admins only.                                | `folderId`, `parentId` (null = top level) | W     |
| `delete_folder` | Deletes a folder. Subfolders and workshops in it move up one level. Admins only.        | `folderId`                                | W     |
| `list_tags`     | Returns all [tags](/en/library/tags/) in use, with their counts.                        | –                                         | R     |

## Workshops

| Tool                | What it does                                                                                                                                                        | Important parameters                                                                                                 | Scope |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----- |
| `list_workshops`    | Returns the workshops you may open, most recently changed first, page by page.                                                                                      | `folderId`, `tagId`, `search` (part of the title), `cursor`, `limit` (1–100)                                         | R     |
| `create_workshop`   | Creates a workshop with its first day.                                                                                                                              | `title`, `folderId`, `date` (date of the first day, YYYY-MM-DD)                                                      | W     |
| `rename_workshop`   | Changes the title.                                                                                                                                                  | `workshopId`, `title`                                                                                                | W     |
| `move_workshop`     | Puts a workshop into a folder or takes it out.                                                                                                                      | `workshopId`, `folderId` (null = no folder)                                                                          | W     |
| `set_workshop_tags` | Replaces the tags with the given complete list. New tags are created in the process; an empty list removes all of them.                                             | `workshopId`, `tags` (up to 24)                                                                                      | W     |
| `export_workshop`   | Returns the whole workshop as one Markdown document, all days in order – the same as the [Markdown export](/en/sharing/export/). Facilitator notes only on request. | `workshopId`, `flavor` (`agenda` = table, `outline` = headings and text), `locale` (`de`, `en`, `fr`, `es`), `notes` | R     |

`move_workshop`, `rename_workshop` and `set_workshop_tags` need at least **Edit** on the workshop.

Only a folder you have access to works as a target (`folderId`, `parentId`); any other counts as not there. This applies to `create_folder`, `create_workshop` and `move_workshop`.

## Bin

Only the workshop's owner or a workspace admin may use these tools – as in the app (see [Bin](/en/library/trash/)).

| Tool               | What it does                                                                                                   | Important parameters | Scope |
| ------------------ | -------------------------------------------------------------------------------------------------------------- | -------------------- | ----- |
| `trash_workshop`   | Moves a workshop to the bin. Nothing is lost.                                                                  | `workshopId`         | W     |
| `list_trash`       | Returns the workshops in the bin, most recently deleted first.                                                 | –                    | R     |
| `restore_workshop` | Brings a workshop back with its folder and tags.                                                               | `workshopId`         | W     |
| `purge_workshop`   | Deletes a workshop **for good**, with all its days and blocks. Only for workshops that are already in the bin. | `workshopId`         | W     |

:::danger[`purge_workshop` can't be undone]
The assistant is instructed to use this tool only when you explicitly ask for permanent deletion.
:::

## Days

| Tool            | What it does                                                                                                                                                       | Important parameters                                          | Scope |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ----- |
| `list_days`     | Returns a workshop's days in order.                                                                                                                                | `workshopId`                                                  | R     |
| `create_day`    | Adds a day at the end. Without a start time, it takes the last day's.                                                                                              | `workshopId`, `title`, `date`, `startMinute`                  | W     |
| `update_day`    | Changes a day's name, date, start or note; anything left out stays. `date: null` removes the date, an empty `note` the note.                                       | `workshopId`, `dayId`, `title`, `date`, `startMinute`, `note` | W     |
| `set_day_start` | Sets only the start of a day.                                                                                                                                      | `workshopId`, `dayId`, `startMinute`                          | W     |
| `move_day`      | Changes the order of the days.                                                                                                                                     | `workshopId`, `dayId`, `afterId` (null = to the beginning)    | W     |
| `delete_day`    | Deletes a day with its schedule. Parked blocks are kept and move to the day before (for the first day, to the one after). The last remaining day can't be deleted. | `workshopId`, `dayId`                                         | W     |

More about days under [Days](/en/agenda/days/).

## Reading

| Tool                | What it does                                                                                                                                          | Important parameters                                                                                    | Scope |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----- |
| `list_module_types` | Returns all available [block types](/en/agenda/blocks/) with their key, default duration and fields. The assistant calls this before creating blocks. | –                                                                                                       | T     |
| `get_workshop`      | Reads a day: calculated start times, all IDs, sections and breakouts, parked blocks of this day and of the other days, plus the current version.      | `workshopId`, `dayId` (without: first day), `view` (`outline` or `markdown`), `locale` (for `markdown`) | R     |

## Whole agenda

| Tool             | What it does                                                                                                                                                                                                      | Important parameters                                                                                     | Scope |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----- |
| `apply_agenda`   | Writes a whole day's schedule in one go, each block with all its fields. **All or nothing**: if a block names an unknown type or its fields don't fit, nothing is written, and all problems are reported at once. | `workshopId`, `dayId`, `mode` (`append` = add at the end, default; `replace` = replace the day), `items` | W     |
| `update_modules` | Changes fields of many blocks and sections of a day in one call; IDs stay the same. Also all or nothing.                                                                                                          | `workshopId`, `dayId`, `updates` (1–500 entries, each `moduleId` plus fields as in `update_module`)      | W     |

### Structure of `items`

Each entry in `items` has a kind (`kind`):

| `kind`     | Meaning                                                                                       | Content                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `module`   | a block                                                                                       | `typeKey` (from `list_module_types`) and the block fields below                                                      |
| `cluster`  | a [section](/en/agenda/clusters-and-breakouts/) whose blocks run one after another            | `title`, `color`, `pinnedStartMinute`, `children` (blocks)                                                           |
| `breakout` | a breakout: strands that run **at the same time**, for example small groups in separate rooms | `title`, `color`, `pinnedStartMinute`, `children` (strands with `title`, `color` and their own blocks in `children`) |

All strands of a breakout start with it; it ends when the longest strand ends. Blocks always hang on a strand, never directly on the breakout. A breakout always sits at day level, never inside another one.

### Block fields

| Field               | Meaning                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `title`             | title of the block                                                                                                                                                                               |
| `durationMinutes`   | duration in minutes                                                                                                                                                                              |
| `pinnedStartMinute` | fixed start time (see [Duration and start times](/en/agenda/timing/)); `null` releases it                                                                                                        |
| `desc`              | the block type's fields, such as description, materials or presenter – validated against its schema                                                                                              |
| `parked`            | `true` puts the block in the [parking area](/en/agenda/parking/)                                                                                                                                 |
| `responsible`       | who is responsible for the block, up to 20 people: a member by `memberId` or exact full name, anyone else by name only; `[]` clears the list (see [Responsible people](/en/agenda/responsible/)) |
| `color`             | sections only: `rose`, `red`, `orange`, `amber`, `emerald`, `teal`, `cyan`, `blue`, `violet`, `slate`                                                                                            |

## Single blocks

| Tool            | What it does                                                                                                                                                               | Important parameters                                                                             | Scope |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----- |
| `add_module`    | Adds a single block at the end of the day or of a section or strand.                                                                                                       | `workshopId`, `dayId`, `typeKey`, `title`, `durationMinutes`, `clusterId`                        | W     |
| `add_cluster`   | Adds a section at the end of the day. With `mode: parallel` it becomes a breakout; a strand is a section with `parentClusterId` = the breakout.                            | `workshopId`, `dayId`, `title`, `color`, `mode` (`sequential` or `parallel`), `parentClusterId`  | W     |
| `update_module` | Changes fields of a block or section; anything left out stays. `desc` replaces the whole description.                                                                      | `workshopId`, `dayId`, `moduleId` and the block fields                                           | W     |
| `move_module`   | Moves a block or section within the day – or, with `toDayId`, a block to the end of another day of the same workshop. There it gets a new ID.                              | `workshopId`, `moduleId`, `dayId` (where it is now), `clusterId`, `afterId`, `toDayId`, `parked` | W     |
| `delete_module` | Deletes a block for good. A deleted section takes its scheduled blocks with it, a deleted breakout its strands and everything in them; parked blocks from inside are kept. | `workshopId`, `dayId`, `moduleId`                                                                | W     |

All tools for days and blocks need at least **Edit** on the workshop.

:::tip[Park instead of delete]
With `update_module` and `parked: true`, the assistant takes a block out of the schedule without deleting it. The [parking area](/en/agenda/parking/) belongs to the whole workshop: `get_workshop` also shows what is parked on other days, and `move_module` with `toDayId` brings a block from there into another day.
:::

## Discover methods (cloud only)

:::note[Only in GoodWorkshop Cloud]
These four tools exist only in [GoodWorkshop Cloud](/en/cloud/overview/). A self-hosted installation doesn't offer them at all. More under [Discover methods](/en/cloud/discover/).
:::

| Tool                    | What it does                                                                                                                                                                                                                                                                                                                    | Important parameters                                                                                                    | Scope |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----- |
| `list_discover_filters` | Returns the method collection's filters with their current values.                                                                                                                                                                                                                                                              | `locale`                                                                                                                | R     |
| `list_discover_entries` | Searches the method collection, newest first. An entry is one day or several – a single building block or a whole program.                                                                                                                                                                                                      | `facets` (values from `list_discover_filters`; all must match), `groupSize`, `maxMinutes`, `search`, `cursor`, `locale` | R     |
| `get_discover_entry`    | Shows an entry day by day with all its blocks and durations. The assistant should show it to you before adopting anything.                                                                                                                                                                                                      | `entryId`, `locale`                                                                                                     | R     |
| `adopt_discover_entry`  | Adopts an entry as a copy: without `workshopId` as a new workshop; with `workshopId` as additional days at the end; with `workshopId` and `dayId`, the blocks at the end of that day (only for one-day entries). The day's name and start stay unchanged. A block whose type doesn't exist in your workspace arrives as a note. | `entryId`, `workshopId`, `dayId`, `title`, `folderId`, `locale`                                                         | W     |

## What doesn't exist

No tool manages members, sharing, share links or tokens. There is also none that lists the members of your workspace. That is intentional – see [Planning with an AI assistant](/en/ai/introduction/).

## See also

- [Examples](/en/ai/examples/)
- [Connect an assistant](/en/ai/connect/)
- [Sections and breakouts](/en/agenda/clusters-and-breakouts/)
- [Blocks and block types](/en/agenda/blocks/)
