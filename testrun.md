1. Run all Attendance tests (with browser)
npx.cmd playwright test tests/attendance/ --project=chromium --headed


This runs all five test files: Smoke, Search, Filters, Date, and Export.

2. Run all tests without opening the browser (CI/CD mode)

npx.cmd playwright test tests/attendance/ --project=chromium

Step 3 — Run without repeating login
For Daily Attendance:
npx.cmd playwright test tests/attendance/attendance.spec.ts --project=chromium --no-deps --headed


For Monthly Register:
npx.cmd playwright test tests/attendance/monthly.smoke.spec.ts --project=chromium --no-deps --headed


For all Attendance tests:
npx.cmd playwright test tests/attendance/ --project=chromium --no-deps --headed  (n0-deps not login again and agin with otp use fixed otp)



///////////////////////////////////

npx.cmd playwright test tests/auth.setup.ts --project=setup --headed (LOGIN COMMAND)