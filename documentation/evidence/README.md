# UniVote documentation evidence

## Captured application screens

The PNG files `01`–`03` in `screenshots/` were captured from the local Vite development server at `http://127.0.0.1:5175/` using the repository's built UI and a local Chromium browser. They show the public platform home page and the student and school administrator sign-in forms. No account credentials were submitted. Protected dashboard screens are not included.

## Unit test run

`unit-tests-terminal.txt` is the captured output from `npm run test:unit`. The run completed with 9 suites and 21 tests passing. `04-unit-test-output.png` is a terminal-style image rendered from that saved command output, not a raw screen capture. The run includes a Node.js deprecation warning from a dependency; it did not fail the run.

## Integration tests

`integration-tests-terminal.txt` records the integration run against the user-confirmed test-only Supabase database: 3 suites and 5 tests passed. Before running, the four fixed test schema names were checked and none existed. After the run, those schemas and tenant rows were checked again and cleanup had removed them. The first attempt failed because Jest's default 5-second per-test timeout was too short for the remote database. The integration runner now sets a 30-second timeout; `integration-tests-initial-run.txt` preserves that first result for transparency. `05-integration-test-output.png` is a terminal-style image rendered from the saved passing output, not a raw screen capture. Docker and the Supabase CLI were unavailable, so the configured test-only Supabase database was used.

The integration run used the per-process `UNIVOTE_TEST_DATABASE_CONFIRMED=true` override after the user confirmed that the configured data is test-only. The value was not written into `.env`.

## Updated document

The V2 document has been updated as `UniVote_Full_chapter_1_-_6_EDITED_V3_READY.docx`. It includes the three application captures and the unit and integration test result images in Chapter Five, updates the automated test results table and contents page, and notes that Playwright end-to-end tests were not run.
