# Usability test plan (PB-43)

Owner: M2 (karma). Requirements: **USE-002** (main), USE-001, USE-003, USE-004, USE-005, USE-006, USE-007. Test plan: [`test-plan.md`](test-plan.md).

Results: [`usability-results.md`](usability-results.md) (4 participants, 24–25 November 2026).

## Goal and pass rule

**USE-002:** in a usability test with representative students, at least **80 percent** of participants complete the task *"find a nearby study location that matches given criteria"* **without assistance**.

- With 5 participants, 4 must complete task T1 unaided (80 %). With 6, 5 must (83 %); 4 of 6 is 67 % and fails.
- "Without assistance" means the moderator gave no hint about where to tap or what to do. Repeating the task card word for word is allowed.
- The other tasks are measured and reported, but only T1 decides PB-43.

## Participants

- 5 to 6 university students in Cairo who study outside home at least sometimes, and who have **not** used StudySpot or seen the team demo it.
- No team members, and nobody who watched an earlier session.
- Each participant uses a prepared test account (`p1@studyspot.test` … `p6@studyspot.test`); the password is kept on the moderator's laptop, not in the repository. No personal data is entered.

## Setup

- **Device:** the moderator's iPhone, with StudySpot added to the home screen from the https link (web app, full screen). The app talks to the live server on Render.
- **One participant at a time,** about 15–20 minutes each. The others wait where they cannot see the screen.
- **Before each session:** open `…/api/v1/health` in Safari a minute before (the free server sleeps after 15 minutes idle). Then reset the app: delete the StudySpot icon from the home screen and add it again from the link (a home-screen web app keeps its own storage, so this brings back the terms and location screens), and set **Settings → Privacy & Security → Location Services → Safari Websites** to **Ask Next Time**. Open the app, accept the terms and allow location, sign in with the participant's test account, and leave it on the home screen.
- **Where:** AUC New Cairo. Only places within 2 km count as "near you", and the live server has 15 sample cafés across Cairo; near AUC there are two, Nadi El-Kitab and Qahwet El-Balad.
- **Morning pre-check (before the first student, at the session spot):** open the app with location allowed and check that **Nadi El-Kitab** is in the "Near me" list with a **Quiet** noise label and a **Moderate** or **Budget** price, and that Qahwet El-Balad is **not** quiet. If the labels changed, pick the place that now matches T1, write it on the moderator copy, and note it in the results. If nothing nearby is quiet, change T1 to "…in New Cairo" for every participant and report that.
- **Location for T5:** after T4, the moderator sets **Safari Websites** location to **Never** and reopens the app, and checks that the list now says "All study places, A to Z" with no Near me button. The app shows no message; the task card says it.
- **Moderator:** reads the script, gives the task cards, stays quiet, takes notes. **Observer (optional):** times each task and fills the results sheet.
- **Results:** the moderator fills in the Google Form **"StudySpot session recording (moderator)"** (karma's Google Drive) on the phone, once per participant per task. Its export (Responses → Download responses, .csv) is saved as [`usability-results.csv`](usability-results.csv); `npm run usability` reads it as is. Typing rows into that CSV by hand works too.
- **Questionnaire:** the Google Form **"StudySpot usability questionnaire"** (karma's Google Drive; SUS plus 3 short questions, listed at the end of this file), filled in on the participant's own phone after the tasks. It does not collect names or e-mail addresses.

## Moderator script

> Thank you for helping us. We are testing an app called StudySpot that helps students find places to study, not testing you. If something is hard to find, that tells us what to fix, so there are no wrong answers.
>
> I will give you a few small tasks on this phone. Please think aloud: say what you are looking for and what you expect to happen. I will not help during a task, because we want to see how the app works on its own. If you get stuck and want to stop a task, just say so, and we move on.
>
> We do not record video or audio, and we do not write your name next to your answers: you are "Participant 3" on our sheet. You can stop at any time. Is that OK?

(Only continue after a clear yes. Then hand over the phone on the app's home screen, signed in as the participant's test account.)

## Tasks

Read each task card aloud and leave it on the table. Start timing when you finish reading; stop when the participant says they are done or gives up. Limit: 3 minutes per task.

| ID | Task card (read aloud) | Success when | Requirement |
| --- | --- | --- | --- |
| **T1** | *"You want to study near where you are now. Find a **quiet** place near you that **isn't too expensive**, and tell me its name."* | The participant names a nearby place whose noise label is Quiet and whose price is **Moderate or cheaper** (Budget or Moderate), using search and filters, the map or StudyMatch. At AUC New Cairo the expected answer is **Nadi El-Kitab** (about 0.8 km away); check it in the morning pre-check. | **USE-002** |
| T2 | *"From this screen, start a search for a café by its name."* | The search field is active within **2 taps** (count the taps). | USE-001 |
| T3 | *"Ask the app, in your own words, to suggest a place for a group study session this evening."* | The participant types a free-text request and gets places shown with their reasons. If the answer says "Smart matching is unavailable", record it and count the task as done if they used the standard results. | USE-005, USE-006 |
| T4 | *"Open one of these places. How busy is it right now, and how sure is the app about that?"* | The participant reads the crowd label and explains its status ("Current", "X hours ago", or "Estimate based on historical data") and that it is an estimate. | USE-003, USE-004 |
| T5 | *"Now the app cannot use your location. Can you still find a place to study in Zamalek?"* (location set to Never first) | The participant finds a place in Zamalek unaided within 3 minutes, by any route (StudyMatch, search, list, map or Location settings). *Changed on 2026-11-24 after the first session: the app does not show that location is off after first launch, so noticing it cannot be required.* | USE-007 |

For each task, write in the sheet: `unaided` (yes / no; a task with a hint never counts as unaided), `assisted` (yes if you had to give any hint), `time_s`, `errors` (wrong turns, back taps, dead ends), and short notes or quotes.

## After the tasks

1. Ask: *"What was the hardest part? What would you change first?"* Write down the answer.
2. Give them the Google Form link (questionnaire below) on their own phone. It takes about 2 minutes.
3. Thank them, then reset the app for the next participant as described under Setup.

## Analysis

- Run `node scripts/usability.mjs` from the repository root. It reads `docs/testing/usability-results.csv` (and, if present, `docs/testing/usability-sus.csv`, the Google Form export), and prints the unaided completion rate per task, **PASS / FAIL for USE-002**, the median time per task, and the average SUS score (68 is the usual "average usability" line).
- Write the results, the top problems and the planned fixes in `usability-results.md`, (done: [`usability-results.md`](usability-results.md)), and mark TC-M2-61 in `test-cases.csv` as Pass or Fail with the date.

## Google Form (questionnaire)

Created on 2026-11-22 in karma's Google Drive. Title: **StudySpot usability questionnaire**. Description: *Anonymous. Thank you for testing StudySpot.* Do not collect e-mail addresses.

1. **Participant number** (drop-down, 1–6; the moderator tells them).
2. The ten **SUS** statements, each a linear scale **1 = Strongly disagree … 5 = Strongly agree**, in this order:
   1. I think that I would like to use this app frequently.
   2. I found the app unnecessarily complex.
   3. I thought the app was easy to use.
   4. I think that I would need the support of a technical person to be able to use this app.
   5. I found the various functions in this app were well integrated.
   6. I thought there was too much inconsistency in this app.
   7. I would imagine that most people would learn to use this app very quickly.
   8. I found the app very difficult to use. (The original SUS says "cumbersome"; the form used "difficult".)
   9. I felt very confident using the app.
   10. I needed to learn a lot of things before I could get going with this app.
3. **Did the "Current / X hours ago / Estimate" labels help you trust the information?** (Yes / Somewhat / No)
4. **Would you use StudyMatch (asking in your own words) again?** (Yes / Maybe / No)
5. **Anything else?** (paragraph, optional)

Export: Responses → Download responses (.csv), save as `docs/testing/usability-sus.csv`, and remove the Timestamp column before committing.
