---
title: How GoodWorkshop is structured
description: Library, folders, workshops, days and blocks – how the parts fit together and why you never type in a start time.
sidebar:
  order: 3
---

Once you know the model, you'll find your way around everywhere. It has five levels, and each
one sits inside the one above it.

```text
Library                    everything in your workspace
└─ Folder                  optional, nested as deep as you like
   └─ Workshop             title, tags, parking area, access
      └─ Day               name, date, start, note about the day
         ├─ Block          type, title, duration, description …
         ├─ Section        groups blocks that run one after another
         │  └─ Block
         └─ Breakout       strands that run at the same time
            └─ Strand
               └─ Block
```

## The levels

| Level        | What it is                                                                                                                                      | Where you edit it                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Library**  | All workshops you may see. Admins see all of them in the workspace.                                                                             | [Folders and workshops](/en/library/folders-and-workshops/) |
| **Folder**   | For sorting, not owning: folders belong to the workspace, not to a person. You see the ones you have access to. A workshop sits in at most one. | **Folders** column in the library                           |
| **Workshop** | The thing you plan. It belongs to the person who created it, carries tags and has a parking area.                                               | Top of the workshop page                                    |
| **Day**      | A workshop day with its own start, its own date and its own agenda. A workshop always has at least one.                                         | [Days](/en/agenda/days/)                                    |
| **Block**    | One agenda item: check-in, input, group work, break. The type sets the color, the usual duration and the extra fields.                          | [Blocks and block types](/en/agenda/blocks/)                |

:::caution[Days and tags]
In the German interface, the same word (“Tag”) means both a workshop day and a keyword on the
workshop (the **+ tag** field below the title). That is why the buttons for days are called
**Workshop day** and **Delete workshop day**. More about keywords under [Tags](/en/library/tags/).
:::

## Sections and breakouts

A **section** groups blocks that run one after another under a heading – for example
“Arrival & framing” with a check-in, the agenda and an energizer. The section row shows how
many blocks it contains and how long they take together.

A **breakout** is a section whose **strands** run at the same time: parallel small groups in
different rooms, each with its own little schedule. All strands start when the breakout starts,
and the breakout ends when the longest strand ends. Blocks always hang on a strand, never
directly on the breakout. There is no breakout inside a breakout. Details under
[Sections and breakouts](/en/agenda/clusters-and-breakouts/).

## The parking area belongs to the workshop

A block you **Park** disappears from the schedule but keeps its description, materials and
notes. It no longer counts toward the time and sits below the agenda under **Parked**. Because
the parking area belongs to the whole workshop, you can bring an exercise that didn't fit on the
first day **Back into the schedule** on the second day. Even when you delete a day, its parked
blocks are kept. More under [Parking area](/en/agenda/parking/).

## Start times are calculated

You never type in a start time for a block. GoodWorkshop works it out:

> Start of the day + duration of all blocks before it = start time of the block

When a duration or the order changes, all following times move along. The day header shows the
start and end, how much of it is content and how much is break, and how many blocks the day has.

The only exception is a **fixed start time**: a block you pin to a clock time stays there. If
the block before it ends earlier, a gap appears, shown as **Buffer**. If it ends later, the row
says, for example, “Overlaps the previous block by 20m” – GoodWorkshop never quietly shortens
anything. More under [Duration and start times](/en/agenda/timing/).

## Next

- [Plan your first workshop](/en/start/quickstart/)
- [Finding your way](/en/start/finding-your-way/)
- [Duration and start times](/en/agenda/timing/)
