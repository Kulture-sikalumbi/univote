

## Fill the evaluation environment table

Use these values. Do not substitute planned software targets for the exact versions used during evaluation.

| Item | Detail |
|---|---|
| Deployment mode | Web client and API ran locally; PostgreSQL database hosted by Supabase. |
| Build identifier | Not recorded. |
| Operating system | Windows; exact version not recorded. |
| Browser | Google Chrome; exact version not recorded. |
| Authenticator used for enrollment | WebAuthn user verification was tried with fingerprint, face unlock, and PIN; device/model not recorded. Do not imply all methods were tested on the same device. |
| Node.js version | Not recorded. |
| PostgreSQL version | Supabase-hosted PostgreSQL; exact server version not recorded. |
| Test date | 23 October 2026. |
| Test data | One school and School Admin account, one student/voter, one election, and multiple candidates with political parties. Exact candidate and office counts were not recorded. Do not include personal identifiers. Label records synthetic only if that is confirmed. |

The project documentation specifies Node.js 20 or later and PostgreSQL 16 as targets. These are not verified versions from the evaluation environment; do not put them in the table as observed versions.

## Add a manual evaluation results table

Add or complete a table with columns for scenario, expected result, observed result, and outcome. Use the following rows and mark them **Passed (manual)** based on the completed walkthrough:

| Scenario | Expected result | Observed result | Outcome |
|---|---|---|---|
| Create school and School Admin account | School and administrator account are created. | Creation completed successfully. | Passed (manual) |
| Register student/voter | Student account is available for sign-in. | Registration completed successfully. | Passed (manual) |
| Create election and add candidates/parties | Election configuration and candidate information are saved. | Election and candidates with political parties were added successfully. | Passed (manual) |
| Student login and WebAuthn enrollment | Student signs in and registers a credential using supported user verification. | Login and credential enrollment completed; fingerprint, face unlock, and PIN were tried. | Passed (manual) |
| Cast vote and view results | Valid vote is accepted and the School Admin tally reflects it. | Vote was accepted; School Admin view count updated in real time. | Passed (manual) |

If the existing draft has a more detailed feature-by-feature table, preserve its structure and map these confirmed outcomes into it without inventing additional scenarios. The complete statement that every implemented feature was tested may appear in the surrounding prose; only list individual features as separate rows when they are represented in the existing requirements or evaluation record.

## Complete the automated test status table honestly

The repository contains unit, integration, and Playwright end-to-end test files. No automated execution output or run totals are available for this report. Do not claim these suites passed or imply they were run. Keep this table separate from the successful manual evaluation above.

| Level | Repository location | Configured command (not a reported run) | Executed / passed / failed / skipped | Status |
|---|---|---|---|---|
| Unit | `apps/api/tests/unit/` | `npm run test:unit` | No execution output available. | No recorded result; manual evaluation reported separately. |
| Integration | `apps/api/tests/integration/` | `npm run test:integration` | No execution output available. | No recorded result; manual evaluation reported separately. |
| Automated end-to-end (Playwright) | `apps/api/tests/e2e/` | `npm run test:e2e` | No execution output available. | No recorded result; manual evaluation reported separately. |

Do not require new test runs just to complete the chapter. If existing project records later show that an automated suite was executed, update only that suite's row using its actual output.

## WebAuthn and continuity with earlier chapters

Connect the implementation and results to the claims and objectives in Chapters One to Three. UniVote does not store fingerprint or face templates. The authenticator performs local user verification, which can use biometrics or another supported method such as a device PIN; UniVote verifies the cryptographic WebAuthn response. The server stores WebAuthn credential information, including the public key in encrypted form, not the biometric data.

If the approved proposal required biometric/passkey authentication, explain how local verification and server-side credential verification address it. If an earlier chapter literally promised that UniVote would centrally store biometric data, transparently identify the difference between the proposal wording and the implemented design. Do not call non-storage of biometrics a limitation unless central biometric storage was an explicit requirement; it is otherwise a privacy-preserving design choice.

