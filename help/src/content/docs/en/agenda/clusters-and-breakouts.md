---
title: Sections and breakouts
description: Group blocks into sections, plan parallel small groups as a breakout with strands, and drag blocks in and out.
sidebar:
  order: 4
---

A long day is easier to read in chapters. For that there are two kinds of containers:

|             | **Section**                      | **Breakout**                             |
| ----------- | -------------------------------- | ---------------------------------------- |
| Contains    | Blocks                           | Strands, and each strand contains blocks |
| Timing      | one after another                | all strands at the same time             |
| Duration    | sum of the blocks                | duration of the longest strand           |
| Typical use | “Arrival & framing”, “Afternoon” | small groups in separate rooms           |

## Sections

A section groups blocks that take place one after another. Its header row shows the name, the number of blocks and their combined duration, for example “3 blocks · 35m”. On a phone, the header row stays at the top while you scroll, so you know which section you're reading.

### Create a section

1. Click **Add section** below the schedule.
2. The section appears at the end of the day as **New section**. The name is already selected, so you can start typing right away.
3. Drag in the blocks that belong to it (see below).

### Name and color

Click the name to change it (**Name of the section**). On the right of the header row, under **Colour of the section**, pick a color from the palette, or **No colour**. The color only tints the header row; the blocks keep the color of their block type.

### Delete a section

The delete button in the header row says what goes with it, for example **Delete with 3 blocks**.

:::danger
A section is deleted _with all the blocks inside it_, without confirmation and without undo. If you want to keep the blocks, drag them out first.
:::

## Breakouts

A breakout is a section whose _strands run at the same time_: parallel small groups, each with its own little schedule. All strands start when the breakout starts. The breakout ends when the longest strand ends, and then the day continues.

The header row says this in words, for example **3 strands, at the same time · longest strand 45m**. Each strand shows its position, time and duration, for example “Strand 2 of 3 · 10:00 AM–10:45 AM · 45m”. On a large screen the strands sit side by side as columns; on a phone, one below the other.

### Create a breakout

1. Click **Add breakout** below the schedule.
2. It appears at the end of the day as **New breakout**, already with two strands, “New strand 1” and “New strand 2”.
3. Rename the breakout and the strands (**Breakout name**, **Strand name**).
4. Fill each strand using its own **Add a block** button.
5. More groups are added with **Add strand** at the end of the columns.

The breakout and the strands each have their own color (**Breakout colour**, **Strand colour**). A strand without blocks shows **No block yet.**

:::tip
For the work inside a strand there is the **Breakout session** block type, with fields such as **Room** and **Free choice of strand**. See [Blocks and block types](/en/agenda/blocks/).
:::

### How a breakout counts

Only the longest strand goes into the day summary (**content**, **breaks**, number of blocks). That way “content plus breaks” stays equal to the time from start to end. A break that only appears in a shorter strand therefore doesn't show up in the day's break time. In the strand itself it is listed with its time.

### Delete

A breakout is deleted with all its strands and blocks (**Delete with 3 strands**). A single strand goes with its blocks (**Delete with 2 blocks**). Here, too, there is no confirmation.

## Dragging in and out

You move blocks, sections and breakouts by the handle on the left of the row, as described under [Blocks and block types](/en/agenda/blocks/). What happens when you drop depends on where you let go:

- **Block into a section:** Between two blocks of a section it always lands in the section. Directly below the last block, or below the header row of an empty section, the horizontal position decides: dragged to the right it lands in the section, to the left on day level. With the keyboard you indent and outdent with Arrow Right and Arrow Left.
- **Block into a breakout:** The column under the mouse pointer is the strand it lands in. If you let go on the breakout's header row, it goes to the end of the first strand. With the keyboard you switch between strands with Arrow Left and Arrow Right.
- **Section into a breakout:** The section becomes another strand, with all its blocks.
- **Strand out of a breakout:** Drag it to day level, and it becomes a section of its own, with all its blocks.

A container takes everything inside it along when you drag it. The times recalculate after you drop.

:::note[Two levels at most]
Nesting is limited: a section contains blocks, a breakout contains strands, a strand contains blocks. A section can't be put inside another section, a breakout can't go into another container, and a block never sits directly in a breakout, always in a strand.
:::

## Fix a start time

Like blocks, you can fix sections and breakouts to a clock time, using the padlock in the header row. Individual strands can't be fixed; they always start with their breakout. More under [Duration and start times](/en/agenda/timing/).

## Related pages

- [Blocks and block types](/en/agenda/blocks/)
- [Duration and start times](/en/agenda/timing/)
- [Live editing together](/en/agenda/live-editing/)
