# How we use AI with your children's data

> **DRAFT FOR LEGAL REVIEW.** This document has not been approved by a lawyer. Items marked [PLACEHOLDER: …] must be completed or confirmed by counsel before it is relied on.

**Version:** 2026-10-draft-1 · **Effective date:** [PLACEHOLDER: effective date]

AI School OS includes features that use artificial intelligence (AI). This page explains, in plain words, what those features see, where the information goes, and the safeguards around it. The school decides which features are switched on.

## The short version

- AI gets information **only to answer the request** in front of it.
- **No training on your children's data.** We do not train our own models on it, and according to the providers' published API terms, data sent through their APIs is not used to train their models by default.
- **Staff review** AI suggestions about a student (marks, remarks, reports) before they count.
- **A child can only reach their own information.** The tutor cannot see other children's records.
- Every AI request is recorded (who, when, which feature, cost) so the school can check use.

## Which features use AI

| Feature | Who uses it | What the AI sees |
|---|---|---|
| AI tutor (text and voice) | Students | The student's question, recent messages in that chat, the student's class and subjects, topic progress and short learning notes. Voice clips when the student chooses to speak. |
| Parent AI ("Ask the school") | Parents | The parent's question and their own children's attendance, published results, fees, homework and events. |
| WhatsApp parent assistant | Parents (if the school turns it on) | The parent's WhatsApp message and the same information as Parent AI. Messages about illness, injury, emergencies or bullying are never answered by AI; they go to staff. |
| Teacher and admin assistants | Staff | What the staff member asks for: e.g. lesson plans, question papers, draft report-card remarks, class insights. Draft remarks may use a student's scores and attendance. |
| Marking help | Staff | Student answers to theory questions, to suggest a mark. A teacher confirms or changes it. |
| Careers guidance | Students, counsellors | Interest-quiz results, subjects and results, to suggest careers and courses. |
| Weekly learning updates | Parents (sent by the school) | A summary of the week's learning for a child, drafted by AI from school records. |

## Where the information goes

AI requests are sent to one of these providers through their business APIs [PLACEHOLDER: confirm which are enabled in production]:

- **OpenAI** (United States) — chat, and speech-to-text and text-to-speech for tutor voice.
- **Anthropic** (United States) — chat.
- **Google (Gemini)** (United States) — optional.

The platform chooses the provider; if one is unavailable another may answer. These providers are outside Nigeria: see section 6 of the privacy notice and the Data Processing Agreement on international transfers. [PLACEHOLDER: counsel to confirm the transfer basis and each provider's data retention for API traffic, e.g. temporary retention for abuse monitoring.]

## Safeguards

- **Only what is needed.** Each feature sends the information needed for that request, not the child's whole record.
- **Own data only.** Students and parents use AI with their own permissions: a student's tutor uses only that student's information; a parent's assistant uses only their own children's.
- **Human review.** AI never publishes a result, sends a report card, or changes a mark by itself. Staff approve.
- **Safety hand-over.** Sensitive messages (health, emergencies, bullying) are passed to staff instead of being answered by AI.
- **Limits.** Daily message allowances and budgets limit use.
- **Records.** AI conversations are stored in the school's account so the school can review them; the school can export them for a data subject request.
- **Children's wellbeing.** The tutor is a patient, step-by-step (Socratic) tutor. It is instructed to keep to learning, never to ask for or store personal details (address, phone, passwords), never to discuss other students, to refuse to help with exam cheating, and — if a child says they are unsafe, hurt or very upset — to respond kindly and encourage them to talk to a parent, teacher or the school counsellor straight away. AI can make mistakes, so these instructions reduce but cannot remove all risk. [PLACEHOLDER: counsel / safeguarding lead to review the tutor's safety rules.]

## Choices for parents

- Parents are told on the consent screen which AI features the school has switched on.
- Parents can ask the school to turn off the AI tutor for their child, or not use the WhatsApp assistant (send STOP to the school's WhatsApp number).
- Parents can withdraw consent in **Settings → Privacy & consent**; the school is told and decides what follows.
- Parents can ask the school for a copy of their child's AI tutor conversations.

## Questions

Contact the school first. The platform operator's Data Protection Officer: [PLACEHOLDER: DPO contact].
