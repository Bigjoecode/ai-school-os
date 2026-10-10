# Target audience, children and Google Play's Families policy

**This is a decision for you (and ideally your lawyer), not something the code decides.** This page sets
out the facts about the app, what Google Play's rules mean for each choice, and a recommendation. Policies
change: read the current *Families* policy and *Target audience and content* help pages in Play Console
before you submit.

## The facts about this app

- It is a **school portal**. Every account is created by a school (or by the platform for a school); there
  is no public sign-up for children, no public chat and no way to find or contact strangers.
- Users are **parents/guardians, school staff and students**. Students range from nursery to SS 3, so some
  are under 13. Young pupils normally use it with a parent or teacher, or on a school device.
- It processes children's personal data (records, homework, AI tutor questions) on the school's behalf,
  with **parental consent** collected by the parent portal under the NDPA (see `docs/legal/`).
- It has **no ads**, no third-party analytics or advertising SDKs, and Play Billing is off.
- It sends AI tutor questions to AI providers (OpenAI / Anthropic, see `/legal/subprocessors`) to answer them.

## How Play Console asks

*Policy and programs → App content → Target audience and content* asks which **age groups** the app targets
(5 and under, 6–8, 9–12, 13–15, 16–17, 18+) and whether it might unintentionally appeal to children.

- If you tick **any group under 13**, the app is subject to the **Families policy**: stricter rules on
  ads and SDKs (only Families-certified ad SDKs; no advertising ID for children), on what data you may
  collect from children and the disclosures you must make, on content, and a stricter review. You may
  optionally join **Teacher Approved** / the Kids tab only if you meet the "Designed for Families" bar.
- If you tick **only 13+ / 18+**, Families rules don't apply in full, but Google can still treat the app as
  child-directed if the listing, graphics or content appeal mainly to children, and the rules on minors'
  data still apply to anyone under 18.

## The options

### Option A — target adults: parents, guardians and school staff (18+), with students also 13+
Tick **16–17 and 18+** (and 13–15 if you want secondary students to download it themselves).
Describe the app as a school portal for families and staff (the listing in `listing.md` does this), keep the
store graphics adult-oriented (the parent screenshots first), and say in the description that accounts come
from the school. Younger pupils use the website (or a parent's phone/app) with the login their school gives.
- **Pros:** fastest review, no Families-specific obligations, matches how accounts are actually issued
  (through schools and parents).
- **Cons:** primary-age pupils aren't the stated audience of the Play app; if Google decides the app
  appeals to children anyway, it may ask you to move to Option B.

### Option B — include under-13 age groups (Families policy)
Tick the age groups your pupils fall in, including under 13.
- **What you must then do (check the current policy):** comply with the Families policy and Families
  data rules (no ad SDKs, which the app already meets; disclose what's collected from children in Data
  safety; make sure the privacy policy covers children — it does, in draft); meet content rules for
  children; possibly a longer review; any future SDK must be Families self-certified.
- **Pros:** honest about the youngest users; eligible for Families features.
- **Cons:** more review friction; AI chat features for under-13s get closer scrutiny; future
  changes (e.g. adding analytics) are constrained.

### Option C — two listings
A parents/staff app now (Option A), and later a separate students' app under the Families policy if
there is demand. More work; only worth it if Play features for children matter to schools.

## Recommendation

**Start with Option A** (target audience 18+, optionally 13+ too; listing aimed at parents, guardians and
school staff; students sign in with school-issued logins). It reflects how the product is sold — to schools
and parents — and it avoids designing the store presence around children. Revisit Option B if Play's review
flags the app as child-appealing, or if you want primary pupils to install it themselves.

Whatever you choose:

- Answer **"Does your app unintentionally appeal to children?"** honestly; the colourful games screenshots
  are better left out of the listing under Option A.
- Keep the in-app parental consent flow (server-enforced) — it's required by the NDPA regardless of Play.
- Fill the **Data safety** form from `data-safety.md`, which already covers children's data.
- Provide reviewer test credentials (see `README.md`, *App access*).
