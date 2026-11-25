# Usability test results (PB-43)

Test case: TC-M2-61. Owner: M2 (karma). Plan: [`usability-test-plan.md`](usability-test-plan.md). Data: [`usability-results.csv`](usability-results.csv) (moderator's record) and [`usability-sus.csv`](usability-sus.csv) (questionnaire). Numbers below come from `npm run usability`.

**USE-002: Fail.** 0 of 4 participants completed T1 unaided by the plan's rule (1 of 4 as recorded); the target is 80 %.

## What was run

- **4 participants** on 24 and 25 November 2026, one at a time, on one iPhone (web app on the home screen) against the live server. The plan called for 5 to 6; accounts p5 and p6 were not used. With 4, all 4 had to succeed at T1.
- **Build:** the app from before the 25 November redesign (commit 6b573c4). Nothing here describes the new look.
- Both questionnaire and moderator form were filled in for all 4 participants. Times are round numbers; the records of P3 and P4 were all entered within about 5 minutes, so their times are approximate.

## Results per task

Unaided = finished correctly within 3 minutes and the moderator gave no hint. "By plan" also checks the plan's success rule (column `done_by_plan`).

| Task | Requirement | Recorded unaided | By plan | Median time |
| --- | --- | ---: | ---: | ---: |
| T1 find a quiet, not too expensive place nearby | USE-002 | 1 of 4 | **0 of 4 (0 %)** | 40 s |
| T2 start a search by name | USE-001 | 4 of 4 | 4 of 4 (100 %), 1 tap each | 10 s |
| T3 ask in your own words | USE-005, USE-006 | 2 of 4 | 0 of 4 (0 %) | 26.5 s |
| T4 how busy, and how sure is the app | USE-003, USE-004 | 2 of 4 | 2 of 4 (50 %) | 20 s |
| T5 find a place in Zamalek without location | USE-007 | 3 of 4 | 3 of 4 (75 %) | 20 s |

Why the attempts did not count:

| Task | Participants | Reason |
| --- | --- | --- |
| T1 | P1, P2 | Named Nadi El-Kitab, the expected place, but after a hint |
| T1 | P3 | Named Dar El-Elm, which is in 6th of October City, about 54 km away, and labelled Moderate noise, not Quiet (live server, checked 25 November). It fails on noise alone, whatever the distance |
| T1 | P4 | StudyMatch was unavailable and no place was found; a hint was given |
| T3 | P1 | Told to use filters (moderator error); a hint was given |
| T3 | P2, P4 | StudyMatch was unavailable and showed no places, so there were no standard results to use |
| T3 | P3 | A hint was given |
| T4 | P1, P3 | A hint was given |
| T5 | P4 | Used StudyMatch, which was unavailable, so no place was found |

**USE-001: Pass.** Every participant reached search in 1 tap, and TC-M2-60 passes on the new build too.

## Questionnaire

**SUS: 96.3 on average** (P1 100, P2 97.5, P3 92.5, P4 95; 68 is the usual average). Read this with care: only 4 people answered, as part of a session with the moderator, and it does not fit the failed tasks. Statement 8 used "very difficult" where the original SUS says "cumbersome".

- The condition labels helped them trust the information: Yes 3, Somewhat 1, No 0.
- Would use StudyMatch again: Yes 4.
- Comments: *"just some adjustments on how the app looks"*; *"i appreciate the description of each function in the app, directs me to the function i want to use without trying out lots of things first."*

## Findings

1. **The app most likely never got the iPhone's location (likely cause of T1).** The Near me button never showed in the sessions (moderator's report). `currentPosition()` first asks the browser whether location is allowed and reads it only on a yes; iPhone Safari is reported to answer that wrongly ([WebKit bug 258726](https://bugs.webkit.org/show_bug.cgi?id=258726)). The app then shows "All study places, A to Z", as if location were off. The far-away places participants named (Al-Fanar, 50 km; Dar El-Elm, 54 km) fit an A-to-Z list. Not yet confirmed on the iPhone. The same check is on main.
2. **StudyMatch was often unavailable.** It is noted as unavailable in 5 task attempts: P1 T5, P2 T3, and P4 T1, T3 and T5. A call that takes over 5 s is given up without a retry, and one question needs two or more calls. In a check of 8 calls on 25 November, 7 took 0.7 to 2 s and 1 hung for over 15 s. The reasons on the live server are in the Render logs and have not been read yet.
3. **The fallback had nothing to show.** P2 and P4 got no places after "unavailable": without a location, StudyMatch can only say "use Search".
4. **The app does not say when location is off.** After the first-launch screen, the only signs are the list label and the missing Near me button.
5. **Participants did not always pick the tool the plan had in mind.** P1 used StudyMatch for T1; P2 and P3 scrolled the list for T1, and P2 was then told to use filters.

## Changes to the plan and limits

- **T5's rule changed after the first session.** It asked participants to notice that location is off, but the app never shows that after first launch (finding 4). For everyone, T5 now counts if a place in Zamalek was found unaided within 3 minutes, by any route.
- T5 does not show that the app handled location being switched off, because the app may have had no location in any task (finding 1).
- Moderator errors with P1: StudyMatch instead of filters in T1, filters instead of StudyMatch in T3.
- Small sample; sessions were moderated by a team member.

## Planned fixes

| Fix | Owner |
| --- | --- |
| Read the location on iPhone Safari even when the permission check is unclear; StudyMatch also accepts "background" access, which it ignores today | M2, with the owner of the location service (Hanna) |
| StudyMatch: retry one slow call within its 9 s limit | M2 |
| Say on the home screen when location is off | To be agreed with the owners of the screen |
| Repeat T1 with new students after the location fix, so USE-002 is tested on a fair basis | M2 |
