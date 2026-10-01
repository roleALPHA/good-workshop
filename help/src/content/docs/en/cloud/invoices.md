---
title: Invoices
description: When the monthly invoice comes, what its status means and where to download it.
sidebar:
  order: 4
---

:::note
This page applies only to GoodWorkshop Cloud. Only admins see invoices.
:::

GoodWorkshop Cloud bills monthly, in arrears. There is one invoice for each month; all of them
are collected under **Billing**.

## When the invoice comes

After the end of a calendar month, whatever accrued in that month is billed:

| Model        | On the invoice                                                    |
| ------------ | ----------------------------------------------------------------- |
| Per user     | the user-months, that is, every active member pro rata to the day |
| Per workshop | the number of workshops created in that month                     |

The price that applied at the start of the billed month is used. A price change that only takes
effect later doesn't change an invoice in progress. Month boundaries are calendar days in Vienna,
where the invoice is issued.

The invoice names the day on which the amount will be collected via your payment method. There
are at least two days between the invoice and the collection. The invoice is in German if the
workspace was registered in German, otherwise in English.

:::tip
If a month comes to zero euros – for example because a voucher covers it completely – there is no
invoice for it.
:::

## Download an invoice

1. Open the account menu at the top right and choose **Billing** under **Administration**.
2. Scroll to **Invoices**. Every invoice is listed there with **Month**, **Amount** and
   **Status**.
3. Click **Download invoice**. The invoice number is next to it.

You get the invoice as a file, exactly as it was sent. If it says **Document to follow**, the
invoice has been issued but the file isn't available yet; it appears by itself.

If there is no invoice yet, it says “No invoices yet.” That's normal during the trial and in the
first month after it.

## What the status means

| Status              | Meaning                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **being prepared**  | The month has been calculated, and the invoice is being issued.                                                                 |
| **under review**    | The invoice is waiting for something to be clarified before it is issued – for example when a VAT number couldn't be confirmed. |
| **issued**          | The invoice has been issued, and the collection is coming up.                                                                   |
| **being collected** | The amount is being debited right now.                                                                                          |
| **paid**            | Done.                                                                                                                           |
| **payment failed**  | The collection didn't work. We'll try again and write to you.                                                                   |

## When a collection fails

We write to you at the **Billing e-mail** and try again after three days and then after another
seven days. In the meantime, check your card and change it under **Change payment method** if
needed.

If the last attempt also fails, the workspace becomes read-only, and you get a payment reminder
with a deadline. If nothing arrives by then, access is blocked. Your content is kept in any case
and can be exported; as soon as the payment arrives, everything continues by itself. The details
are under [Pricing and billing](/en/cloud/pricing-and-billing/).

## Correct billing details

You change the company name, address, VAT number and billing e-mail under **Billing details** on
the same page. A change applies to the next invoices.

:::caution[Businesses in other EU countries]
Without a valid VAT number we can't issue you an invoice without VAT. Billing for the affected
month then stays **under review** until the number is cleared up.
:::

## Questions about an invoice

Write to us via **Support** in the account menu and give the month or the invoice number. The
form sends your workspace, role and language along by itself.

## See also

- [Pricing and billing](/en/cloud/pricing-and-billing/)
- [Vouchers](/en/cloud/vouchers/)
- [Support](/en/troubleshooting/support/)
