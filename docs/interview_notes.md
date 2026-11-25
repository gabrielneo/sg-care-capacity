# Questions a reviewer might ask

Not published on the site (it is not in the site's list of rendered docs). The notes below say what is true, and give an answer that stays inside it.

## 1. "Does this show that seniors wait longer in emergency departments?"

**No, and the site says so.** MOH's bed-wait data has no age breakdown. The home page shows bed waits for admitted patients
and clinics per senior side by side, with a visible line that no link between them is tested. The weakest version of the
project would have implied one.

**A fair answer:** "No. MOH publishes no age split, so I show bed waits and senior clinic access side by side and say I do not test a link. Claiming one would have been the easy headline and the wrong one."

## 2. "How do you know the numbers are right?"

What is true: every figure traces to a raw file with a hash, the pipeline's checks can block a release, and an AI agent that was
not given the code traced 20 random numbers back to the raw cells (19 matched; the 20th is an external citation).

What is not true: it is not an independent audit. The agent was run by me, the sample is 20 numbers, and no human reviewed it
([audit report](audit_report.md), "Limits of this audit"). A human reviewer would check a fresh sample, the clinic-to-area
assignment near borders, every caveat against its source, and every "Data as of" date.

**A fair answer:** "The checks are automated and the traceability audit was an AI agent I set up, so I treat it as a strong consistency check, not a third-party audit. What a person should still do is the short list in the audit report."

## 3. "Why is the clinic ranking trustworthy for areas like Rochor or River Valley?"

Partly. The median (1.16 clinics per 1,000 seniors) does not move whether the minimum is 1,000, 2,000 or 3,000 seniors; the ends
do. Both zeros and the top rate come from areas with under 3,000 seniors, and Rochor and Outram have far more clinics than
residents, which suggests people who work or visit use them ([methodology](methodology.md)). They are marked, not hidden,
because hiding them is also a judgement. The ratio counts CDMP GP clinics only, from a list about two years older than the
resident counts.

**A fair answer:** "I would keep 1,000 as the minimum, because the median does not move, and mark the small areas. If the ranking were used to place clinics I would raise it to 3,000 and look at Rochor and Outram by hand."

## Also likely

- "Why did you change the rule for 'higher than usual'?" The old rule flagged a hospital in 13% of weeks, so about one hospital
  in eight was "above usual" most weeks, and noisy hospitals were flagged on ordinary swings. The new rule (a robust z-score of
  2.5 against the hospital's own previous 26 weeks) flags about 5%.
- "How much did the AI do?" See the README section on AI assistance, once you have filled in your part.
