# Chapter Draft Voice Correction Prompt

Revise the Chapter Four and Chapter Five draft so it reads like the project report written by its student researcher, not like an outside evaluator describing an author or an AI system.

## Voice and point of view

- Follow the point of view and tense already used in Chapters One to Three. If they use first person and the department permits it, use that consistently (for example, “I evaluated the system”). Otherwise use formal, neutral academic phrasing (for example, “The system was evaluated…”). Do not switch voices within a chapter.
- Do not refer to the writer in the report prose as “the author,” “the user,” “the student,” or “the researcher” when that means the person writing this report. Do not refer to Claude, AI, prompts, this conversation, or where information was supplied.
- Convert meta descriptions of evidence into direct report prose. Keep evidence gaps as the existing visible placeholders, but do not write sentences around them that describe what the author has or has not supplied.
- Do not make the prose sound uncertain merely because evidence was provided through conversation. The student conducted and observed the evaluation; report the stated procedure and outcomes directly. Keep actual gaps such as missing logs, screenshots, versions, or exact counts as placeholders where needed.
- Do not invent details to make the prose sound complete. Preserve every meaningful limitation, scope boundary, and caveat.

## Replace meta phrasing with report phrasing

Use transformations like these:

- Avoid: “The author reports that all implemented features worked.”
  Use: “Manual testing of the implemented features showed that they operated as expected.”
  If the report uses first person: “I manually tested the implemented features, and they operated as expected.”

- Avoid: “The author performed each step through the application’s own user interfaces.”
  Use: “The evaluation followed the normal election workflow through the application interfaces.”
  Or, if consistent with earlier chapters: “I evaluated the system by following the normal election workflow through its interfaces.”

- Avoid: “The author did not keep a separate feature-by-feature log.”
  Use a neutral factual sentence only if accurate: “A separate feature-by-feature test log was not retained.” Otherwise keep `[TO CONFIRM: whether a feature-by-feature test log was retained]`.

- Avoid: “The author has not yet provided screenshots.”
  Use: `[TO COMPLETE: add screenshots if available]` or omit the sentence until the report evidence is assembled.

- Avoid: “The results rest on the author’s own account of the evaluation.”
  Use: “The results are based on the manual evaluation conducted in the local development environment.” If lack of independent or contemporaneous evidence matters, state that limitation directly and neutrally, if true.

## Evaluation facts to retain

The evaluation was conducted locally on 23 October 2026. The tested workflow included creating a school and School Admin account, registering a student voter, creating an election, adding candidates and their political parties, logging in as the student, registering WebAuthn credentials, casting a vote, and observing the School Admin results count update in real time. Manual testing covered every feature implemented in the system; the implemented features operated as expected. Some planned features may not have been included in the implemented system. Keep those omitted features in scope/limitations discussion, not as failures of implemented functionality.

Do not claim that automated unit, integration, or Playwright suites passed unless actual execution output is available. Keep manual evaluation and automated test results in separate subsections or table rows.

## Evaluation table values currently known

Use the following facts directly in the relevant evaluation table. Preserve the remaining placeholders until the exact information is confirmed; do not guess to make the table look complete.

| Item | Detail to enter |
|---|---|
| Deployment mode | Web client and API ran locally; the PostgreSQL database was hosted by Supabase. |
| Test date | 23 October 2026. |
| Build identifier | Not recorded for the 23 October 2026 evaluation. Do not substitute the current Git commit unless it is verified as the evaluated build. |
| Operating system | Windows; exact version not recorded. |
| Browser | Google Chrome; exact version not recorded. |
| Authenticator | WebAuthn credential enrollment and user verification were tried using fingerprint, face unlock, and PIN. The exact device/model is not recorded. Do not imply all methods were on the same device unless confirmed. |
| Node.js / PostgreSQL versions | Exact Node.js version not recorded. The database was Supabase-hosted PostgreSQL; exact PostgreSQL server version not recorded. Project documentation specifies Node.js 20 or later and PostgreSQL 16 as its target; these are not verified evaluation-machine versions. |
| Test data | One school with a School Admin account, one student/voter, and one election were created; multiple candidates and their political parties were added. Exact candidate/office counts are not recorded. Do not include real student identifiers or other personal data; call records synthetic only if confirmed. |
| Manual outcome | The student completed biometric/WebAuthn credential enrollment and cast a vote; the School Admin view showed the count updating in real time. The implemented features were reported to work as expected. |

For the automated test-suite status table, use the repository's configured commands but do not imply they were run:

| Level | Repository location | Configured command | Execution status / result | Status |
|---|---|---|---|---|
| Unit | `apps/api/tests/unit/` | `npm run test:unit` | No execution output available to report. | No recorded result; the manual evaluation is reported separately. |
| Integration | `apps/api/tests/integration/` | `npm run test:integration` | No execution output available to report. | No recorded result; the manual evaluation is reported separately. |
| Automated end-to-end (Playwright) | `apps/api/tests/e2e/` | `npm run test:e2e` | No execution output available to report. | No recorded result; the manual evaluation is reported separately. |

These are statuses for the **automated suites only**. Do not let them erase or contradict the successful manual end-to-end evaluation above. A manual end-to-end evaluation is valid project evaluation evidence when consistent with the approved methodology; do not require new automated test runs just to fill this table. Complete the tables with the confirmed facts above. For details genuinely unavailable today (for example, build ID, exact software versions, exact candidate count), write `Not recorded` instead of leaving unresolved yellow placeholders or guessing. Keep a `[TO CONFIRM]` placeholder only when the student can reasonably check the information and wants to do so.

## WebAuthn wording and connection to earlier chapters

Describe WebAuthn accurately and consistently with Chapters One to Three. UniVote does not store fingerprint or face templates. The authenticator performs local user verification, which may use biometrics or another supported method such as a device PIN; UniVote receives and verifies a cryptographic WebAuthn response. The server stores WebAuthn credential information, including the public key in encrypted form, not the user's biometric data.

Present non-storage of biometric templates as a privacy-preserving design choice if the approved requirement was biometric/passkey authentication. If earlier chapters explicitly promised that UniVote would centrally store biometric data, transparently identify the difference between that proposal wording and the implemented design; do not conceal it or describe the biometric template as stored.

## Preserve

- Keep the approved objectives, methodology, citations, chapter numbering, and department format.
- Keep placeholders for missing build identifier, operating system, browser, authenticator method, software/database versions, counts, and supporting screenshots/records. Do not replace placeholders with guesses.
- Keep results tied to the actual implementation and the earlier chapters. Do not state that all imaginable edge cases or every code path were tested; the claim is that every implemented feature was manually tested.
- Return the revised chapter text and a brief list of unresolved placeholders only. Do not include commentary about AI authorship in the thesis text.
