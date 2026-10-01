---
title: Parking area
description: Take blocks out of the schedule without deleting them, and put them back in on any day of the workshop.
sidebar:
  order: 5
---

Not every block you prepare makes it into the schedule. One gets cut because time is running short, another is an alternative you want to keep at hand. Instead of deleting such blocks, you _park_ them. They keep their type, duration, description and all fields, but no longer count toward the day's time.

## Park a block

1. Hover over the block or click into it.
2. Click **Park** below the block.

The block disappears from the schedule and now sits at the bottom in the parking area. The start times of the following blocks move up, and the summary at the top no longer counts it.

:::note[Fixed blocks stay where they are]
If a block with a fixed start time comes after the parked block, it doesn't move up. Instead, a gap opens before it, shown as **Buffer**. The end of the day then doesn't change. See [Duration and start times](/en/agenda/timing/).
:::

## The parking area

Below the schedule is the parking area, with the heading **Parked** and the number of blocks, for example **Parked (3)**. Below it is the hint: **Belongs to the workshop, does not count towards the time.** Each entry shows its title and duration. If nothing is parked, the parking area isn't shown.

The parking area belongs to the _whole workshop_, not to one day. On every day you see all parked blocks, no matter which day they were parked on. The parking area doesn't show where a block came from.

## Bring a block back

Click **Back into the schedule** on the parked block. It always goes into the day you currently have open:

| Where was it parked? | Where does it land?                                               |
| -------------------- | ----------------------------------------------------------------- |
| On this day          | In its old place, including the same section or strand as before. |
| On another day       | At the end of this day, on day level, not in a section.           |

From there you drag it to the right place, see [Blocks and block types](/en/agenda/blocks/).

A block that comes over from another day takes everything with it: fields, responsible people and even a fixed start time. It gets a new internal ID in the process. If bringing it over fails, the block goes back to the parking area, and a message says why.

:::tip[Move a block to another day]
Park the block, switch to the target day using the tabs, and click **Back into the schedule** there.
:::

## When a day is deleted

When you delete a day, its schedule goes with it. Its parked blocks, however, stay: they move to the parking area of the day before, or of the day after if you delete the first day. Tidying up a day doesn't decide anything about the alternatives that were meant for the whole workshop. See [Days](/en/agenda/days/).

:::caution[Sections take their parked blocks with them]
A parked block remembers the section or strand it came from. If you delete that section, strand or breakout, the parked block is deleted along with it, even though the delete button only counts the blocks in the schedule. If you want to keep it, first bring it back with **Back into the schedule** and drag it out of the section, or bring it over from another day.
:::

## Who can do what

- **Park** and **Back into the schedule** for blocks of the same day can be used by anyone who may edit the day, including guests with **Read and write**.
- Only members with write access can bring a block over from _another day_. Guests see these entries, but without a button.
- Anyone who may only read sees the parking area but can't move anything.

Parked blocks appear neither in the time calculation nor in the day summary. When you print or export a day, they're left out, because they aren't part of the schedule.

## Related pages

- [Blocks and block types](/en/agenda/blocks/)
- [Days](/en/agenda/days/)
- [Duration and start times](/en/agenda/timing/)
