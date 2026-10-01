---
title: Planning with an AI assistant
description: What MCP is, what a connected AI assistant such as Claude or ChatGPT can do in GoodWorkshop – and what it deliberately can't.
sidebar:
  order: 1
---

GoodWorkshop has a built-in **MCP server**. With it, you can connect an AI assistant such as Claude, ChatGPT or Gemini to your workshops and ask it to draft, rework or summarize an agenda. What it writes lands directly in your library – no copying, no retyping.

## What is MCP?

MCP (Model Context Protocol) is an open standard through which AI assistants work with other programs. A program offers the assistant **tools** – in GoodWorkshop, for example, “create workshop”, “read day” or “write a whole agenda”. Based on your request, the assistant decides which tools to call.

You connect the assistant once to your installation's address, for example `https://goodworkshop.org/api/mcp` in GoodWorkshop Cloud. How that works is described under [Connect an assistant](/en/ai/connect/).

## What the assistant can do

A connected assistant can do what you can do in the library and in the day editor:

| Area             | Examples                                                                              |
| ---------------- | ------------------------------------------------------------------------------------- |
| Library          | create folders, create workshops, rename them, put them in folders, set tags          |
| Bin              | move workshops to the bin, restore them, delete them for good                         |
| Days             | add, reorder and delete days; change name, date, start and note                       |
| Agenda           | write a whole day in one go, with sections and breakouts                              |
| Blocks           | change, move, park and delete single blocks or many at once; enter responsible people |
| Reading          | read a day with all its times, get the whole workshop as Markdown                     |
| Discover methods | search the method collection and adopt entries (cloud only)                           |

The complete list with all parameters is in the [Tool reference](/en/ai/tools/), and ideas for requests are under [Examples](/en/ai/examples/).

A few things the assistant does the same way GoodWorkshop itself does:

- **GoodWorkshop calculates start times** from the start of the day and the durations. The assistant doesn't set them, but it can pin a block to a fixed time – see [Duration and start times](/en/agenda/timing/).
- **It writes whole agendas in one call.** That is all or nothing: if one block doesn't fit, nothing at all is written, and the assistant learns what to correct.
- **It writes live.** If you have the day open, you see its changes immediately, and it appears in [live editing](/en/agenda/live-editing/) as **AI assistant**. So that it doesn't overwrite something you just changed, it can send the version it last read with every change. If the workshop has changed in the meantime, GoodWorkshop refuses the change and the assistant has to read again.

## What the assistant can't do

:::caution[Deliberately excluded]
Over MCP there are **no** tools for:

- **Members** – inviting, removing or making anyone an admin,
- **Sharing** – [sharing](/en/sharing/share-with-people/) a workshop or a folder with people,
- **Share links** – [inviting guests](/en/sharing/share-links/) or withdrawing links,
- **Tokens** – creating or revoking access keys.

Granting others access to your data is a step you take yourself in the app – no model should be able to do that on your behalf.
:::

Also:

- **The assistant acts as you.** It can never do more than you can. It can't change a workshop you may only read; it can only move or delete folders if you are an admin of the workspace. And it only sees the workshops you see in your library.
- **You decide what it may do when you connect it** – through the scopes you allow (for example read only, or write as well). See [Connect an assistant](/en/ai/connect/).
- **It doesn't change block types.** It reads them to know which fields a block has.
- **It doesn't see the member list.** It names responsible people by their full name; if a name matches nobody in the workspace, the person is entered as external – see [Responsible people](/en/agenda/responsible/).

:::note[Deleting for good]
The assistant can only delete a workshop for good if it is already in the [bin](/en/library/trash/), and it is instructed to do so only at your explicit request. Phrase it clearly if that's what you want – and better not at all if it isn't.
:::

## Where the connection lives

In GoodWorkshop you'll find everything about the connection in the profile menu at the top right under **AI Connection**: the server URL, instructions for individual clients and your personal tokens.

## See also

- [Connect an assistant](/en/ai/connect/)
- [Tool reference](/en/ai/tools/)
- [Examples](/en/ai/examples/)
- [AI connection – Troubleshooting](/en/troubleshooting/ai-connection/)
