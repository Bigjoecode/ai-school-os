# Data protection pack (DRAFT FOR LEGAL REVIEW)

Draft documents for AI School OS under the Nigeria Data Protection Act 2023 and the NDPC's guidance. **None of these have been reviewed by a lawyer.** Every company-specific or legal-judgement item is marked `[PLACEHOLDER: …]`; search for that string to find them all.

| File | Served at | Audience |
|---|---|---|
| [privacy-notice.md](privacy-notice.md) | `/legal/privacy` | Parents, students, staff |
| [ai-use-statement.md](ai-use-statement.md) | `/legal/children` | Parents |
| [terms-of-service.md](terms-of-service.md) | `/legal/terms` | Schools |
| [data-processing-agreement.md](data-processing-agreement.md) | `/legal/dpa` | Schools |
| [subprocessors.md](subprocessors.md) | `/legal/subprocessors` | Schools |
| [data-retention.md](data-retention.md) | `/legal/retention` | Schools, counsel |

The web app imports these files at build time (`apps/web/src/features/legal`), so editing a file here updates the public page on the next deploy.

## Versions

Versions live in `packages/shared/src/data-protection.ts` (`LEGAL_VERSIONS`). Keep the version line at the top of each document in step with it.

- Changing `LEGAL_VERSIONS.privacy` asks every parent to accept the notice again at their next sign-in.
- Changing `LEGAL_VERSIONS.dpa` shows schools that they accepted an older DPA, and asks them to accept the new one in Settings → Data protection.

## In the app

- **Parents**: a one-time consent screen in the portal (the school can make it required or optional); Settings → Privacy & consent shows what they agreed to and lets them withdraw.
- **School admins**: Settings → Data protection — DPA acceptance, consent coverage and CSV export, the consent requirement switch, links to these documents, and the data subject request helper.
