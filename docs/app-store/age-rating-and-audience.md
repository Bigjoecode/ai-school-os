# Age rating and audience (App Store)

**A decision for you (and ideally your lawyer).** Facts about the app are the same as for Google Play
(`docs/play-store/audience-and-families.md`): a school portal, accounts issued by schools, users are parents,
staff and students from nursery to SS 3, no ads, no tracking, no public chat, AI tutor answers questions for
students.

## The age rating questionnaire

App Store Connect → *App Information → Age Rating → Edit*. Apple's questionnaire (updated in 2025 to the 4+, 9+,
13+, 16+, 18+ ratings) asks about content and about capabilities. Answer truthfully; for this app:

| Question area | Answer | Why |
|---|---|---|
| Violence, sexual content, nudity, profanity, horror, drugs/alcohol/tobacco, gambling, contests | **None** | School material only; games are quizzes with no simulated gambling. (Set texts in literature/history are syllabus material.) |
| Medical or treatment information | **None** | Health records in the school's welfare module are records, not medical content or advice |
| Mature/suggestive themes | **None** | |
| Unrestricted web access | **No** | The app only shows the portal; other sites open in Safari, outside the app |
| User-generated content / messaging and chat | **Yes** | Staff message parents; students hand in work; the AI tutor answers free text. Communication is within a school, not with strangers |
| Advertising | **No** | |
| Parental controls / age assurance | Answer as asked: parents see their children's records and give consent; accounts are issued by the school | |
| Generative AI (if asked) | **Yes** — the tutor and staff AI tools generate text; answers are limited to school use and say they can be wrong | |

The questionnaire computes the rating. Expect roughly **9+ or 13+** because of user communication and AI; that's
fine for a school portal used by parents and staff, and doesn't stop younger pupils using a parent's phone or a
school device. Don't pick a higher **override** unless you want to.

## Kids Category — not recommended

Putting the app in the **Kids Category** (App Store Connect → *Age Rating → Made for Kids*) is optional and comes
with strict rules (guidelines 1.3 and 5.1.4):

- no links out of the app, and no purchases, without a **parental gate** — this app opens Paystack, WhatsApp,
  YouTube and school websites in other apps, and parents pay fees: every one would need a gate;
- no third-party analytics or advertising, and limits on what can be sent to third parties — the AI tutor sends
  questions to AI providers, which needs careful justification;
- the app must be designed for children under 11 in one age band (5 and under, 6–8 or 9–11), but most users are
  parents and staff and many students are teenagers;
- once in the Kids Category, getting out later is hard.

**Recommendation:** don't choose *Made for Kids*. List the app as a school portal for families and staff (the
listing in `listing.md` does this, with parent screenshots first), answer the questionnaire honestly, and keep
the existing parental-consent flow (required by the NDPA anyway). Revisit only if you build a separate app for
young pupils.

## Region note

For Nigeria there's no extra rating board. If you add countries with their own rules (e.g. South Korea's
GRAC, Brazil's ClassInd, Australia) App Store Connect asks extra questions — answer them the same way.
