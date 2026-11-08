# UniVote V3 evidence update

Source: `UniVote_Full_chapter_1_-_6_EDITED_V2.docx`. Output: `UniVote_Full_chapter_1_-_6_EDITED_V3_READY.docx`. Earlier versions remain unchanged.

## Test runs

- Unit tests: `npm run test:unit` — 9 suites and 21 tests passed.
- Integration tests: `npm run test:integration` — 3 suites and 5 tests passed against the test-only Supabase database identified by the user.
- Before the integration run, the four fixed test schemas and matching tenant rows were absent. Afterward, the integration cleanup had removed them.
- The initial integration run timed out because Jest's 5-second test timeout was too short for the remote database. `apps/api/scripts/runIntegrationTests.cjs` now passes `--testTimeout=30000` to Jest. The initial failure transcript is retained in `documentation/evidence/integration-tests-initial-run.txt`.
- The Playwright end-to-end suite was not run.

## Document changes

- Chapter 5, Table 9 now records the actual unit and integration results and marks Playwright as not run.
- Chapter 5, Section 5.3.5 includes captures of the platform home page and student and school administrator sign-in screens.
- Chapter 5 includes terminal-style result images rendered from the saved command transcripts. They are derived from the actual outputs and are identified as rendered output, not raw terminal screenshots.
- Chapter 4 and Chapters 5–6 now distinguish completed unit/integration runs from the Playwright scenarios that remain unrun.
- The limitations and future-work sections were updated to reflect the recorded runs.
- The contents page fields were refreshed after adding the evidence.

Evidence files are in `documentation/evidence/`; the README there describes capture methods and database precautions.
