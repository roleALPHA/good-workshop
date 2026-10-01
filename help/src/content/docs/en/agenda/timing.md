---
title: Duration and start times
description: How GoodWorkshop calculates start and end times from the start of the day and the durations, how to fix a clock time and what happens when blocks overlap.
sidebar:
  order: 3
---

In GoodWorkshop you don't type in start times. You give the day a start and each block a duration, and the clock times follow from that: the first block starts with the day, each further one when the previous one ends. Move a block, change a duration or park something, and all times are right again immediately.

## Set the start of the day

Below the day tabs is the **Start of the day** field. Change the time there, and all blocks move along, except those you have fixed. A new day takes over the start of the day that was last until now, see [Days](/en/agenda/days/).

## Change a duration

The duration is shown in bold below the start time. Click into it and type a new one. The field understands many ways of writing it:

| You type                 | Result                      |
| ------------------------ | --------------------------- |
| `45`, `45m`, `45 min`    | 45 minutes                  |
| `1h30`, `1h 30m`, `1:30` | 1 hour 30 minutes           |
| `1,5h`, `1.5h`, `1h`     | 1 hour 30 minutes or 1 hour |

These formats work in every interface language; spelled-out English words such as `hours` or `mins` are not recognized. Enter or a click elsewhere accepts the value, Escape discards it. Anything the field can't read unambiguously is not guessed: it jumps back to the old value, and a red border warns you while you're still typing. A duration is between 0 minutes and 24 hours.

:::tip[With the arrow keys]
In the duration field, Arrow Up adds 5 minutes and Arrow Down takes off 5. With Shift held down, it's 15 minutes. The value is applied immediately.
:::

Sections and breakouts don't have a duration of their own. Theirs follows from the blocks inside them, see [Sections and breakouts](/en/agenda/clusters-and-breakouts/).

## Fix a start time

Sometimes a time is set: lunch comes at 12:30 PM, the board at 2:00 PM. Then you fix the block to that time.

1. Hover over the block or click into it. An open padlock appears next to the start time. On a touchscreen it is always visible.
2. Click the padlock (**Fix start time**). The block takes the time at which it currently starts. So at first nothing changes in the schedule.
3. Enter the time you want in the **Fixed start time** field.

A fixed block shows a closed padlock. It stays at its time, no matter what happens before it. The blocks after it continue from its end. With **Release fixed start**, another click on the padlock, it goes back to being calculated normally.

You can fix a section or a breakout the same way; its padlock sits in its header row, and on a phone it isn't shown there. A breakout's strands always start together with the breakout.

## Gaps and overlaps

Because a fixed block doesn't give way, the schedule before it doesn't always fit exactly.

- **Gap:** If the previous block ends earlier, a dashed line with **Buffer** appears before the fixed block, for example “15m Buffer”. This is only a display, not a block.
- **Overlap:** If the previous block ends later, the fixed block shows a warning: **Overlaps the previous block by 10m**. The two blocks then run at the same time, on paper.

:::note
GoodWorkshop never resolves an overlap by itself, never shortens anything and never moves anything. That is intentional: often it is only an interim state until you have shortened a block before it. The warning stays until the times fit again.
:::

## End of the day

Below the last block is the time at which the day ends, with the word **End**. You'll find the same time at the top in the summary, together with the **content**, the **breaks** and the number of blocks. Breaks are the times of the types **Break**, **Lunch**, **Buffer** and **Note**; everything else counts as content. Parked blocks don't count at all.

If a day runs past midnight, a `(+1)` follows the time, for example `1:30 AM (+1)`. That's why a fixed time earlier than the start of the day counts as a time on the following day: a block you fix to 1:00 AM on a day that starts at 8:00 PM sits at `1:00 AM (+1)`.

## Related pages

- [Days](/en/agenda/days/)
- [Blocks and block types](/en/agenda/blocks/)
- [Sections and breakouts](/en/agenda/clusters-and-breakouts/)
- [Parking area](/en/agenda/parking/)
