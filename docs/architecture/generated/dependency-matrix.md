# Module dependency matrix (generated)

Generated from the code by `npm run deps:graph` (backend/scripts/module-graph.mjs). Do not edit by hand.
Rows are callers, columns are providers. A cell names the interface the caller injects, or the domain event it publishes to that listener.
"(planned)" marks an event designed in the SDS that the module will emit once its stub is replaced. Every module also uses IClock and its own repositories (not shown).

| caller \ provider | accounts | audio-ai adapter | email adapter | llm adapter | maps adapter | push adapter | audit | clock | conditions | configuration | notifications | presence | qr-codes | rewards | surveys | venues |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **accounts** |  |  |  |  |  |  | event SignInFailed | IClock |  |  |  |  |  |  |  |  |
| **admin** | IAuth |  |  |  |  |  | IAudit<br>event StaffAction (planned) |  |  | IConfig |  |  |  |  |  |  |
| **audio** |  | IAudioAI |  |  |  |  |  | IClock | event NoiseRecorded (planned) |  |  |  |  |  |  |  |
| **conditions** |  |  |  |  |  |  |  | IClock |  | IConfig |  | IPresence |  |  |  |  |
| **configuration** |  |  |  |  |  |  |  | IClock | event ConfigChanged (planned) |  |  |  |  | event ConfigChanged (planned) |  |  |
| **notifications** |  |  |  |  |  | IPush |  |  |  |  |  |  |  |  |  |  |
| **presence** |  |  |  |  |  |  |  | IClock |  | IConfig | event PresenceDwell (planned) |  |  |  |  |  |
| **qr-codes** |  |  |  |  |  |  |  | IClock |  |  |  | IPresence |  | IRewards | ISurvey |  |
| **rewards** |  |  | IEmail |  |  |  |  | IClock |  | IConfig |  | IPresence |  |  |  |  |
| **scheduler** |  |  |  |  |  |  |  |  | IConditions |  |  | IPresence | IReceiptCodes | IRewards | ISurvey |  |
| **studymatch** |  |  |  | ILLM |  |  |  |  | IConditions |  |  |  |  |  |  | IVenueQuery<br>IPreferences |
| **surveys** |  |  |  |  |  |  |  | IClock | event SurveyStored (planned) |  |  |  |  | IRewards |  |  |
| **venues** | IAuth |  |  |  | IMaps |  |  |  | IConditions | IConfig |  |  |  |  |  |  |
