---
title: Blocks and block types
description: Add, edit, move and delete blocks – and which fields each block type comes with.
sidebar:
  order: 2
---

A block is one row in the schedule: a check-in, an input, a break. Every block has a _block type_. The type sets the color, the suggested duration and the fields you can fill in under **More fields**.

## Add a block

1. Click **Add a block** below the schedule.
2. Type in the **Type to filter …** field to narrow down the list of types. Each type shows its default duration next to it.
3. Click a type, or press Enter to take the first match. Escape closes the list again.

The new block sits at the end of the day, is named after its type and has that type's default duration. In a breakout, each strand has its own **Add a block** button, which puts the block straight into that strand.

### Insert between two rows

If the block shouldn't go at the end, move the mouse onto the border between two rows. A line with a “+” appears there. Clicking it opens the choice right at that spot: **Block**, **Section** and **Breakout**. **Cancel** or Escape closes it again.

- Between two blocks of a section, the new block lands in that section. Only **Block** is offered there, because sections can't be put inside each other.
- Below the last block of a section, a **Block** still goes into the section, while a **Section** or **Breakout** goes directly after it.
- On a phone the “+” is always visible. With the keyboard you reach it with Tab.

:::caution[You choose the type once]
You can't change a block's type later. If you picked the wrong one, delete the block and create it again with the right type.
:::

## What a row contains

The agenda has three columns: **Time**, **Title and description** and **Additional info**. On a phone they turn into cards, and everything essential is still editable there.

- **Time:** the calculated start time and, below it, the duration. How to change it or fix a clock time is described under [Duration and start times](/en/agenda/timing/).
- **Format:** below the time, via **Choose a participation format** (for example **Plenary**, **Small groups** or **Individual**).
- **Title:** click it directly and type. Enter or a click elsewhere saves, Escape discards. An empty title is not accepted.
- **Responsible:** below the title, see [Responsible people](/en/agenda/responsible/).
- **Description:** below that. On wide screens you edit it right in the row; on narrower ones it is only displayed.
- **Materials:** in the **Additional info** column, via **+ material**. Confirm each entry with Enter.

Some types also show a field as a small label in the **Additional info** column, for example the presenter or the deliverable of a group work.

## More fields

Below every block is **More fields**. Clicking it expands the block type's remaining fields; **Fewer** collapses them again. Only one block is expanded at a time, so the agenda stays readable. Changes are saved as soon as you leave a field.

Every type has the **Facilitator notes** field. It is marked “only for you” and doesn't appear in the read view. When printing and in the Markdown export, the notes are only included if you check **With facilitator notes**. If a block has notes, a small icon next to **More fields** shows it.

## The block types

All types have **Description**, **Format**, **Materials** and **Facilitator notes**. The table lists what comes on top of that. “Break” in the third column means: the time counts toward breaks instead of content in the day summary.

| Block type                 | Default duration | Counts as | Own fields                                                                          |
| -------------------------- | ---------------: | --------- | ----------------------------------------------------------------------------------- |
| **Welcome & housekeeping** |              10m | Content   | Agenda overview                                                                     |
| **Check-in**               |              15m | Content   | Opening question, Format, Time per person (sec.)                                    |
| **Input / presentation**   |              20m | Content   | Presenter, Slides, Key points                                                       |
| **Plenary discussion**     |              20m | Content   | Guiding question                                                                    |
| **Group work**             |              45m | Content   | Task, Group size, Number of groups, Deliverable, Room setup                         |
| **Breakout session**       |              30m | Content   | Task, Room, Room setup, Group size, Free choice of strand, Report back, Deliverable |
| **Exercise**               |              30m | Content   | Instructions, Method description, Debrief                                           |
| **Decision / vote**        |              20m | Content   | Method, Options                                                                     |
| **Reflection**             |              15m | Content   | Reflection question, Alone first, then shared                                       |
| **Energizer**              |              10m | Content   | Activity, Space needed                                                              |
| **Break**                  |              15m | Break     | –                                                                                   |
| **Lunch**                  |              60m | Break     | Catering                                                                            |
| **Buffer**                 |              10m | Break     | –                                                                                   |
| **Check-out**              |              15m | Content   | Closing question, Format                                                            |
| **Next steps**             |              15m | Content   | Capture owners, Capture deadlines                                                   |
| **Note**                   |               0m | Break     | –                                                                                   |

The **Breakout session** is meant for the work inside a strand: a small group works in parallel to the others in its own room. How strands work is described under [Sections and breakouts](/en/agenda/clusters-and-breakouts/).

## Move blocks

Each row has a handle on the left that appears as soon as you hover over it or click into the row. On a touchscreen it is always visible.

- **Mouse:** Grab the handle and drag. Dragged to the right, a block indents into the section above it; dragged to the left, it leaves the section again.
- **Touch:** Press and hold the handle briefly, then drag. A normal swipe still scrolls the page.
- **Keyboard:** Tab to the handle, pick it up with the space bar, move it up and down with the arrow keys, indent or outdent with left and right, and drop it with the space bar. Escape cancels.

The start times recalculate by themselves after every move.

## Park or delete

Below every block are two buttons:

- **Park** takes the block out of the schedule without deleting it. It waits in the [parking area](/en/agenda/parking/) and doesn't count toward the time.
- **Delete** removes it for good.

:::danger
**Delete** doesn't ask for confirmation, and the editor has no undo. The block is gone immediately for everyone who has the day open. If you're unsure: better **Park** it.
:::

## Related pages

- [Duration and start times](/en/agenda/timing/)
- [Sections and breakouts](/en/agenda/clusters-and-breakouts/)
- [Parking area](/en/agenda/parking/)
- [Print](/en/sharing/print/)
