---
title: Share with people
description: Give colleagues from your workspace access to a workshop or a whole folder – to read or to edit.
sidebar:
  order: 1
---

You can share a single workshop or a whole folder with people from your workspace. Both work the same way: a list of all members, and for each person you choose what they may do.

:::note[Only members of your workspace]
You don't invite anyone by e-mail address here. The list shows everyone who is already a member of your workspace. Anyone missing is added first under [Members](/en/account/members/). For outside people without an account there are [share links](/en/sharing/share-links/).
:::

## The access levels

| Level         | What the person can do                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No access** | They don't see the workshop.                                                                                                                                                       |
| **Read**      | They see the schedule but change nothing. Printing and Markdown export work.                                                                                                       |
| **Edit**      | They edit the schedule of all days [live](/en/agenda/live-editing/), rename the workshop, set [tags](/en/library/tags/) and move it into another folder. Printing and export work. |
| **Owner**     | The person who created the workshop. This level can't be granted here.                                                                                                             |

Only the owner and the workspace's admins may share a workshop, move it to the [bin](/en/library/trash/) or delete it for good.

The page itself puts it briefly: “Editors see changes immediately — they are in the same document. Readers see the schedule but change nothing.”

## Share a workshop

1. Open a day of the workshop.
2. Click **Access** at the top right. Only the owner and the workspace's admins see this button.
3. In the person's row, choose **Read**, **Edit** or **No access**.

The change applies immediately; there is no save button. To take someone's access away again, set it to **No access**.

:::note[Access can come from elsewhere too]
This list only shows the shares on the workshop itself. If the workshop is in a shared folder, that folder's people still have access – even if it says **No access** here. The workspace's admins can reach every workshop anyway.
:::

Below the list of people, on the same page, is the **Guests without an account** section – those are the [share links](/en/sharing/share-links/).

## Share a folder

A share on a folder applies to everything in it: to subfolders and also to workshops that belong to other people.

1. Open the [library](/en/library/folders-and-workshops/).
2. Open the folder's menu (the three dots) and choose **Access**.
3. In the person's row, choose the level.

Anyone without access to a folder does not see it – not in the library, not in the export, not through an [AI assistant](/en/ai/introduction/). If you share only a subfolder, it sits at the top for that person, and the folder above stays hidden from them.

:::caution[Moving means sharing]
A workshop you move into a shared folder is thereby shared – with everyone who has access to the folder. Check the folder's shares before you put anything confidential in it. You can only move things into folders you have access to yourself – the same goes for creating workshops and subfolders.
:::

### Who may grant what in a folder

Nobody passes on more than they have themselves:

| Your role in the folder          | You may grant         |
| -------------------------------- | --------------------- |
| Created it (you made the folder) | **Read** and **Edit** |
| Admin of the workspace           | **Read** and **Edit** |
| **Edit**                         | **Read** and **Edit** |
| **Read**                         | **Read** only         |

Anyone who may only read still sees the page and learns who has access – with the note: “You can see who has access here, but not change it.”

Whoever created a folder keeps it; in the list, that person shows **Created it**.

### Inherited shares

If someone has access through a parent folder, the list says so, for example “Read · via Clients”. If you have no access to that parent folder yourself, the list does not name it and says “Read · via a folder above” instead. The rules:

- **The nearest folder decides.** A share directly on this folder beats the inherited one. That way a subtree can be shared for editing and a folder inside it only for reading.
- If you remove the share here again, the person falls back to the inherited one, not to **No access**.

:::note
Even through a folder, the most you can get is **Edit**, never owner. Deleting or passing on someone else's workshop stays with its owner.
:::

## Sharing through the AI assistant?

No. Sharing, inviting guests and managing members is deliberately only possible in the app, never through a [connected AI assistant](/en/ai/introduction/).

## See also

- [Share links](/en/sharing/share-links/) – invite outside people without an account
- [Members](/en/account/members/) – bring people into the workspace
- [Folders and workshops](/en/library/folders-and-workshops/)
- [Live editing together](/en/agenda/live-editing/)
