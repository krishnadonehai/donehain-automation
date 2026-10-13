# Validation

- TypeScript compilation and Playwright discovery are checked during packaging.
- Browser execution is not verified in this environment: the browser download
  returned an invalid/truncated archive. No live DoneHai requests were made.
- The input locators, rows, filter options and original flows come from the
  user-provided markup, snapshot and successful local run.
- The independent-context cookie checkpoint design is new and needs a live
  staging run. Refresh-token rotation is not confirmed by backend evidence.
- No CI/CD files, restricted-account placeholders or deliberately skipped tests
  are included in this scoped starter.
- The fixture represents 2026-10-09 and three specific employees visible to
  test1@donehai.com. Expected data must be maintained when date/account/data changes.

Results: TypeScript passed; Playwright discovered 11 tests (one setup and ten Attendance).
run  npx.cmd playwright test tests/attendance --project=chromium  