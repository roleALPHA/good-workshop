---
title: Examples
description: Example requests to a connected AI assistant – from a whole workshop day with a breakout to the export – and what the assistant does in GoodWorkshop along the way.
sidebar:
  order: 4
---

The following requests work with any connected assistant, whether Claude, ChatGPT or Gemini. You write completely normally, in English or any other language. Below each request it says which [tools](/en/ai/tools/) the assistant typically uses. The exact approach is up to the model.

Prerequisite: the assistant is [connected](/en/ai/connect/), and for anything that writes, it has the **Write workshops** scope.

## 1. Plan a whole workshop day with a breakout

> Create a workshop “Sales team day” on March 12. Start at 9:00. First arrival and check-in, then an input on annual planning, then 60 minutes of small groups in three rooms – existing customers, new customers, partners – each with a work phase and a results flipchart. Then lunch, in the afternoon results in plenary, a decision on the three most important measures, and check-out.

What the assistant does:

1. `list_module_types` – learns your workspace's block types, such as check-in, input, breakout session, lunch.
2. `create_workshop` with title and date – creates the workshop along with its first day.
3. `apply_agenda` – writes the whole day in **one** call. The small groups become a breakout with three strands that run at the same time, each with its own blocks.

You don't need to give start times: GoodWorkshop calculates them from the start and the durations. More about the structure under [Sections and breakouts](/en/agenda/clusters-and-breakouts/).

:::tip[Show first, then write]
Add “Show me the schedule before you create it” if you want to look it over first.
:::

## 2. Add a second day

> Add a second day to the team day on March 13, start at 8:30, half a day: review of day 1, action planning in pairs, closing.

The assistant finds the workshop with `list_workshops`, creates the day with `create_day` and fills it with `apply_agenda`.

## 3. Park a block and bring it back later

> In the team day, park the input on annual planning, we need the time for the small groups. In exchange, extend the breakout by 20 minutes.

1. `get_workshop` – reads the day with all IDs.
2. `update_modules` – sets `parked: true` on the input and changes the durations of the blocks in the strands, in one call.

The block is kept in the [parking area](/en/agenda/parking/). Later:

> Bring the parked input to day 2, right after the review.

The assistant uses `move_module` with `toDayId` and puts the block in the right place.

## 4. Pin a break to a fixed time

> Lunch has to start at 12:30, no matter what happens before it.

The assistant sets a fixed start time with `update_module` (`pinnedStartMinute: 750`). If the morning runs longer, GoodWorkshop shows an overlap – see [Duration and start times](/en/agenda/timing/).

## 5. Enter responsible people

> Put Anna Berger down as responsible for all morning blocks, and for the small groups add one person each from the client team: Mr. Kaya, Ms. Lind and Ms. Novak.

The assistant changes all the affected blocks with `update_modules` in one call. GoodWorkshop recognizes members of your workspace by their **exact full name**. Anyone who doesn't match – here the people named only by their last name – is entered as an external person. The assistant doesn't get a list of members. More under [Responsible people](/en/agenda/responsible/).

## 6. Export the workshop and work with it

> Get the team day as text and write a short invitation e-mail to the participants from it, in English. Without my facilitator notes.

The assistant calls `export_workshop` – with `locale: en` and without notes – and receives the whole workshop as Markdown, all days in order. From that it writes the e-mail. You get the same document in the app through the [Markdown export](/en/sharing/export/).

## 7. Tidy up the library

> Put all workshops with “Sales” in the title into a new folder “Sales 2026” and give them the tag “internal”.

`create_folder`, then `list_workshops` with a search, and for each workshop `move_workshop` and `set_workshop_tags`. The assistant skips workshops you may only read – it can never do more than you.

:::caution[Tags are replaced]
`set_workshop_tags` sets the **complete** list. So explicitly ask it to keep existing tags if you only want to add one.
:::

## 8. Adopt a method (cloud only)

> Find me a short opener for 20 people in the method collection, 15 minutes at most. Show me two suggestions, and add the one I pick to the beginning of day 2.

1. `list_discover_entries` with `groupSize` and `maxMinutes`.
2. `get_discover_entry` – shows you the suggestions with all their blocks.
3. After you choose, `adopt_discover_entry` with workshop and day. The building block lands as a copy at the **end** of the day; the assistant then moves it to the beginning with `move_module`.

Only in [GoodWorkshop Cloud](/en/cloud/discover/).

## What doesn't work

> Share the team day with my colleague.

The assistant declines or points you to the app: sharing, [share links](/en/sharing/share-links/) and members are deliberately not available over MCP. You share yourself under **Access** – see [Share with people](/en/sharing/share-with-people/).

## Tips for good results

- **Give the framework**: date, start, group size, rooms, fixed appointments such as lunch.
- **Say whether to replace or add.** If the whole schedule should be rewritten, the assistant can replace the day (`mode: replace`); otherwise it adds to the end.
- **Ask to see interim results** when a day is already open for others – changes appear immediately in [live editing](/en/agenda/live-editing/).
- **Permanent deletion only when explicit.** `purge_workshop` needs your clear request.

## See also

- [Tool reference](/en/ai/tools/)
- [Planning with an AI assistant](/en/ai/introduction/)
- [Connect an assistant](/en/ai/connect/)
