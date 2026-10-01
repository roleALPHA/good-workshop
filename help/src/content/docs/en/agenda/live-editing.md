---
title: Live editing together
description: Work on a workshop day with several people at the same time – who is there right now, how changes come together and what happens when the connection drops.
sidebar:
  order: 7
---

Everyone who may edit a workshop works in the same document. When someone changes a title, moves a block or parks something, the others see it immediately, without reloading. There is no save button and no edit mode. Every change is sent automatically.

Sharing happens _per day_. If you have Day 1 open, you see changes to Day 1 immediately; what happens on Day 2 you see as soon as you switch there.

## Who is there right now

As soon as someone else has the same day open, a bar with name badges appears above the agenda, one per person, with initials and name. If you're alone, the bar stays hidden.

When someone is working in a block, that block has a colored border and a badge with the name at the top right. If there are several people, it says, for example, “Mira +1”. Each person has their own color, which stays the same on all devices. The color is never the only information: the name is always shown with it.

:::note[The AI assistant works visibly alongside you]
When a connected AI assistant writes to the day, it appears in the same bar, with a robot icon and labeled **AI assistant**. Its changes show up for everyone immediately, just like a person's. See [Planning with an AI assistant](/en/ai/introduction/).
:::

## When a change is sent

| What                                                 | Sent                                   |
| ---------------------------------------------------- | -------------------------------------- |
| Title, duration, description                         | with Enter or when you leave the field |
| **Note about the day**, fields under **More fields** | when you leave the field               |
| Moving, parking, deleting, fixing                    | immediately                            |
| Duration with the arrow keys                         | on every key press                     |

While something is still on its way, **Saving …** briefly appears below the agenda. When you open a day you may see **Connecting …**. When everything runs normally, GoodWorkshop shows no status at all.

## When two people change the same thing

You can work on different blocks at the same time without getting in each other's way. Two people moving different blocks at the same time don't disturb each other either.

On the same block, **Title**, **Duration**, the fixed start time and **Responsible** are saved separately. If one person changes the title and another the duration, both changes are kept.

:::caution[Same field: the last change wins]
If two people change the same field, the change that arrives last stays. A block's description, **Format**, materials and all fields under **More fields** are saved together. If you edit two of these fields on the same block at the same time, one change can overwrite the other. Agree on who takes which block. The colored border shows you where someone is typing right now.
:::

There is no undo. What someone deletes is gone for everyone. If you're unsure, park instead, see [Parking area](/en/agenda/parking/).

## Connection lost

If the connection drops, for example on a train or on a conference hotel's Wi-Fi, a notice appears:

**No connection. Your changes will be sent as soon as it is back.**

You can keep working. GoodWorkshop tries to restore the connection by itself, quickly at first, then at longer intervals of at most 15 seconds. Once it's back, your changes are sent and merged with everyone else's. The other people's name badges disappear while you're offline.

:::danger[Don't reload while the notice is showing]
Your changes from the offline time live only in this browser tab. If you reload the page or close the tab before the connection is back, they're lost. Wait until the notice disappears.
:::

If the connection is there but a change hasn't reached the server yet, your browser warns you with its own dialog when you leave the page.

## Who works live

- Members with write access and guests with **Read and write** work live in the same document.
- Anyone who may only read gets the read view. It shows the state from when the page was opened and doesn't update by itself. Reloading shows the current state.

If someone's access is withdrawn while they have the day open, they can't send anything from then on. How to grant access is described under [Share with people](/en/sharing/share-with-people/).

## Related pages

- [Share with people](/en/sharing/share-with-people/)
- [Planning with an AI assistant](/en/ai/introduction/)
- [Blocks and block types](/en/agenda/blocks/)
