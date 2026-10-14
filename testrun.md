1. Run all Attendance tests (with browser)
npx.cmd playwright test tests/attendance/ --project=chromium --headed


This runs all five test files: Smoke, Search, Filters, Date, and Export.
2. Run all tests without opening the browser (CI/CD mode)
npx.cmd playwright test tests/attendance/ --project=chromium