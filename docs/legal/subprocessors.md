# Sub-processors

> **DRAFT FOR LEGAL REVIEW.** This document has not been approved by a lawyer. Items marked [PLACEHOLDER: …] must be completed or confirmed by counsel before it is relied on.

**Version:** 2026-10-draft-1 · **Effective date:** [PLACEHOLDER: effective date] · **Last updated:** [PLACEHOLDER: date]

These are the service providers that the operator of AI School OS ([PLACEHOLDER: legal entity name]) uses to run the platform, and that may handle personal data of schools' students, parents and staff. The operator will give schools [PLACEHOLDER: number] days' notice of a new sub-processor, as set out in the Data Processing Agreement.

## Engaged by the operator for every school

| Provider | Purpose | Data involved | Location | Safeguards |
|---|---|---|---|---|
| Namecheap, Inc. (shared hosting, cPanel) | Hosting the web app, the API, the PostgreSQL database and uploaded files; server backups (JetBackup) | All platform data | [PLACEHOLDER: confirm data-centre location (Namecheap operates US, UK and EU data centres)] | [PLACEHOLDER: transfer basis; Namecheap terms/DPA] |
| OpenAI, L.L.C. | AI chat, tutor speech-to-text and text-to-speech | The content of each AI request (see "How we use AI with your children's data") | United States | [PLACEHOLDER: transfer basis]. According to the providers' published API terms, API data is not used to train their models by default. [PLACEHOLDER: confirm API data retention period] |
| Anthropic, PBC | AI chat | The content of each AI request | United States | As above |
| Google LLC (Gemini API) — optional | AI chat, only if enabled by the operator | The content of each AI request | United States | As above. [PLACEHOLDER: confirm whether enabled in production; confirm paid-tier API terms apply] |
| Paystack Payments Limited | Online payments for platform subscriptions and parents' AI/exam-prep purchases; saved cards for renewals (card data is held by Paystack, not by the platform) | Payer name, email, amount, payment reference | Nigeria | [PLACEHOLDER: Paystack terms; PCI DSS] |
| Operator's email (SMTP) provider | System alerts and account emails | Email address, message content | [PLACEHOLDER: provider and location, e.g. the hosting provider's mail server] | [PLACEHOLDER] |
| Browser push services (Google, Mozilla, Apple, Microsoft) | Delivering push notifications to devices that opted in | Encrypted notification payload, device push address | Various | Payloads are encrypted end-to-end under the Web Push standard |

## Connected by a school, using the school's own account

A school can connect its own accounts for these services. The school chooses and contracts with these providers itself; the platform sends data to them on the school's instructions. [PLACEHOLDER: counsel to confirm whether these are the school's own processors rather than the operator's sub-processors, and how this is presented to schools.]

| Provider | Purpose | Data involved | Location |
|---|---|---|---|
| Paystack Payments Limited (school's account) | Parents paying school fees online | Payer name, email, amount, invoice reference | Nigeria |
| Termii | SMS to parents and staff | Phone number, message text | Nigeria |
| School's SMTP email provider (e.g. cPanel mail, Zoho, Google Workspace) | Email to parents and staff | Email address, message text | Depends on the provider |
| Meta Platforms (WhatsApp Cloud API) | WhatsApp messages and the WhatsApp parent assistant | Phone number, message text | [PLACEHOLDER: Meta processing locations] |
| Zoom Video Communications | Live classes | Names of attendees, meeting details, attendance, recordings if enabled | United States / [PLACEHOLDER] |
| Google (Google Meet / Calendar) | Live classes | Names and emails of attendees, meeting details, attendance, recordings and transcripts if enabled | [PLACEHOLDER] |
| BigBlueButton server (school-chosen host) | Live classes | Names of attendees, meeting details | Depends on the host |

## Changes

[PLACEHOLDER: how schools are told about changes — e.g. email to the school's admin contact and a notice in Settings → Data protection — and how a school can object.]
