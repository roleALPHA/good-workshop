---
title: Pricing and billing
description: The cloud's two billing models, payment method, changing plans, cancellation and what a workspace's states mean.
sidebar:
  order: 3
---

:::note
This page applies only to GoodWorkshop Cloud. Only admins see billing.
:::

Everything about money is on one page: open the account menu at the top right and choose
**Billing** under **Administration**.

## Two billing models

One model applies per workspace. You choose it when you register and can switch it every month.

| Model            | What is billed                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------- |
| **Per user**     | every active member per month, pro rata to the day                                           |
| **Per workshop** | every newly created workshop, once, in the month it was created – with any number of members |

The current amounts are on the [pricing page](https://goodworkshop.org/pricing) and in the
selection under **Billing model**. All prices are net, plus VAT:

- Businesses in Austria pay 20% VAT.
- Businesses in other EU countries with a valid VAT number pay net (reverse charge).
- Businesses outside the EU pay no Austrian VAT.

### Who counts in the “Per user” model

Every member is counted for every day they were **Active**. Invited people who have never signed
in, disabled members and guests without an account don't count. Under **This month so far** you
see the current state, for example “3.5 user-months”, and the net amount up to today.

Trial days and workshops created during the trial aren't charged.

## Switch the model

1. Under **Billing model**, choose the other model.
2. Click **Apply**.

A switch applies from the first of the next month. Until then it says “From next month: …”; the
current month still runs on the previous model.

## The payment method

Payment is by card, collected by the payment provider. You enter your card details on the
provider's page; GoodWorkshop never sees or stores them.

1. Under **Payment method**, click **Add payment method** (or later **Change payment method**).
2. Enter your card on the payment provider's page.
3. You come back to billing. There it says “A payment method is on file.”

Directly below, you redeem a [voucher](/en/cloud/vouchers/).

## The billing details

Under **Billing details** are the **Company name**, address, **VAT number** and the
**Billing e-mail**, to which invoices and payment notices are sent. You save changes with
**Save**; GoodWorkshop checks a VAT number in the EU's VIES register.

Billing is monthly in arrears, collected two days after the invoice at the earliest. More under
[Invoices](/en/cloud/invoices/).

## A workspace's states

The status is shown under **Billing**; below the header, everyone sees a notice about it.

| Status                   | Notice below the header                          | What it means                                                                                         | What happens next                                                                                                           |
| ------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Trial until …**        | “Trial: … days left.”                            | Everything works, free of charge.                                                                     | At the end, **Active** with a payment method, **Read-only** without one.                                                    |
| **Active**               | none                                             | Everything works.                                                                                     | –                                                                                                                           |
| **Read-only**            | “reading and exporting work, changing does not.” | The trial ended without a payment method, or an invoice couldn't be collected even after the retries. | After the trial: add a payment method. With an unpaid invoice: sort out the payment; you'll get a reminder with a deadline. |
| blocked                  | “… blocked over an unpaid invoice.”              | No payment arrived within 14 days of the payment reminder. Exporting still works.                     | As soon as the payment arrives, everything continues by itself.                                                             |
| **Paused**               | “Content can be read but not changed.”           | We have put the workspace on hold.                                                                    | Write to [Support](/en/troubleshooting/support/).                                                                           |
| **Will be deleted on …** | “… will be deleted on ….”                        | Deletion requested or contract ended. Reading and exporting work until that date.                     | Until then **Take back deletion** stops it, after a cancellation too.                                                       |

:::tip
Even when read-only, blocked or about to be deleted, you can
[export your workshops as Markdown](/en/sharing/export/).
:::

## Cancel

The contract can be ended at the end of any calendar month.

1. Under **End the contract**, click **End the contract**.
2. Read the notice and click **End at the end of the month**.

Until the end of the month you keep working normally, and the last month is invoiced as usual.
After that the workspace becomes read-only (status **Will be deleted on …**); for 30 days all
workshops can still be exported, then the contents are deleted. Until the end of the month you
can take back the cancellation with **Withdraw the cancellation**, afterwards with
**Take back deletion** – the workspace then carries on as if you had not cancelled. A
[voucher](/en/cloud/vouchers/) changes none of this: it decides what is charged, not whether the
contract runs.

## Delete the workspace right away

**Delete workspace** doesn't wait for the end of the month. Type the workspace's name to confirm
and click **Request deletion**. The workspace becomes read-only immediately and is deleted for
good after 30 days, with all workshops, members and shares. The current month is billed pro rata.
Until then you can back out with **Take back deletion**.

:::danger
Once the 30 days have passed, the contents are gone. Export what you want to keep beforehand.
:::

## Price changes

You learn about new prices at least six weeks in advance, by e-mail and below the header (“New
prices apply from ….”). They apply from the first of a month; if prices go up, you can cancel
until then.

## See also

- [Invoices](/en/cloud/invoices/)
- [Vouchers](/en/cloud/vouchers/)
- [Members](/en/account/members/)
- [Pricing](https://goodworkshop.org/pricing) and [terms](https://goodworkshop.org/terms)
