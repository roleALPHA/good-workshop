# Data Processing Agreement

Version: 22 September 2026

> Only the German version of this agreement is legally binding. This translation is provided for understanding.

under Art. 28 GDPR between the Customer (controller) and roleALPHA GmbH, Aschergasse 34, 1130 Vienna (processor). It forms part of the contract for GoodWorkshop Cloud and applies upon its conclusion.

## 1. Subject matter and duration

The processor operates GoodWorkshop Cloud for the controller. This agreement applies for the term of the main contract.

## 2. Nature and purpose of the processing

Storing, displaying, collaboratively editing, sharing and exporting workshop plans, and sending sign-in and invitation e-mails.

## 3. Types of data and data subjects

- Data: names and e-mail addresses, roles and access rights, the content of workshop plans, technical usage data (e.g. sign-in times)
- Data subjects: the Customer’s members, guests invited by them, people named in workshop plans

## 4. Obligations of the processor

1. It processes the data only on documented instructions from the controller; the main contract and the settings within the Service count as instructions.
2. It obliges everyone with access to the data to maintain confidentiality.
3. It takes the technical and organisational measures set out in Annex 1.
4. It supports the controller with data subject requests, with notifying personal data breaches and with data protection impact assessments.
5. It notifies the controller of a personal data breach without delay, at the latest within 48 hours of becoming aware of it.
6. It makes available to the controller the information required to demonstrate these obligations and allows for audits after prior notice.

## 5. Sub-processors

The controller consents to the use of the following sub-processors:

- netcup GmbH, Germany — hosting in data centres within the EU
- Microsoft Ireland Operations Ltd., Ireland — sending e-mail
- Odoo S.A., Belgium — accounting and invoicing
- Stripe Payments Europe Ltd., Ireland — payment processing

Odoo and Stripe receive only what an invoice and its collection require: company, billing address, VAT identification number, billing e-mail address and the quantities billed. They do not receive workshop content or the names of the controller’s members.

The processor gives at least 30 days’ notice of intended changes; the controller may object for good cause.

## 6. End of the processing

After the contract ends, the controller can export their data. The processor deletes it at the latest 30 days after the contract ends, unless a statutory retention obligation applies.

## Annex 1: Technical and organisational measures

- **Encryption:** transmission exclusively over TLS; credentials for mail servers stored encrypted
- **Tenant separation:** customers are separated in the database by enforced row-level security
- **Access control:** sign-in without a password, via passkeys or one-time e-mail links; roles and rights per workshop and folder; separate database roles with minimal privileges
- **Operations:** data centres within the EU; signed software images scanned for vulnerabilities; regular security updates
- **Availability:** daily backup with restore tests
- **Accountability:** logging of security-relevant events

This version is also provided in other languages. Only the German version is authoritative and legally binding; translations are provided for understanding.
