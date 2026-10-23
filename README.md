# DoneHai Automation — Login and Attendance

A Playwright/TypeScript project for local and GitHub Actions testing of DoneHai
login and attendance flows.

## 1. Extract into a new project folder

Download `donehai-automation.zip` to Downloads. In Windows PowerShell:

```powershell
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\donehai-automation.zip" -DestinationPath "$env:USERPROFILE\donehai-automation"
Set-Location "$env:USERPROFILE\donehai-automation"
npm ci
npx playwright install chromium
Copy-Item .env.example .env
notepad .env
```

Do not overwrite your existing `donehai-playwright` folder. Node.js 22 or newer
is recommended for this package. `.env.example` contains the approved staging
email/fixed-OTP example. Confirm it matches your staging account. Do not paste
real access/refresh tokens into this project or messages.

## 2. Check expected test data

Open `data/attendance.json`. It records the exact account-visible data in the
snapshot you supplied: 2026-10-09, Test One/TEST-001 (Manager), Test Three/TEST-003
and Test Four/TEST-004 (MR), all Absent. These expectations are not universal for
every account, date or environment. They must match an approved, stable staging
dataset. Ask the developer to maintain that dataset; this project does not create
or change employees or attendance records on the server.

The page currently opens the app's DEFAULT selected date. The JSON date must
match that date. On another day, update the date AND verify the expected records
and statuses against your approved test data. Do not update assertions just to
make a real defect pass. Selecting a historical fixture date will be implemented
after the open-calendar markup is available.

## 3. Run Login and Attendance

```powershell
npm run typecheck
npm run test:attendance
npm run report
```

This runs login ONCE as a setup dependency, then ten separate Attendance tests.
The default visible Chromium browser is maximized with actions slowed by 700 ms.
Change `SLOW_MO=0` for normal speed or `HEADLESS=true` for hidden execution.

Other useful commands:

```powershell
# Only generate a fresh session:
npm run test:login

# Run Attendance with the latest saved session, without entering OTP:
npm run test:reuse

# Run login plus one selected test:
npx playwright test --project=chromium --grep "Search mr"

# View the previous HTML report:
npx playwright show-report
```

When the saved session is rejected/expired, run `npm run test:login` before
`npm run test:reuse`, or use `npm run test:attendance` normally. Do not run
multiple commands/windows using this account at the same time.

## Folder structure

| Path | Purpose |
| --- | --- |
| pages/LoginPage.ts | Login locators/actions |
| pages/AttendancePage.ts | Table, filters and assertions |
| fixtures/auth.ts | Reuse and checkpoint authentication per test |
| utils/session.ts | Atomic saved-state writing |
| data/attendance.json | Explicit expected records, search and filter values |
| tests/auth.setup.ts | One login per normal run |
| tests/attendance/attendance.spec.ts | Ten independently reported tests |
| playwright.config.ts | Browser, reports, sequential execution |
| .env | Local staging credentials; not committed |

## Exactly what is checked

1. Headers and full expected records (including dates and statuses).
2. Search `mr` returns the two expected employees and excludes the Manager.
3. Clearing search restores all three employees.
4. An unknown search returns zero records and a matching UI count.
5. Management department can be selected and reset.
6. Sales department can be selected and reset.
7. Present filter returns exactly the fixture's Present records (currently zero).
8. Absent filter returns exactly the fixture's Absent records (currently three).
9. Calendar opens and closes.
10. CSV download succeeds and is nonempty.

This preserves your previously successful scope and adds separate reporting and
two search checks. It does NOT claim department membership, date selection, CSV
content, restricted-role permissions or a populated Present result are verified.
Those need the corresponding source data/markup and will be added incrementally.

## Authentication and independent tests

Each test uses a fresh browser context and page, so UI filters do not leak into
the next test. Execution is sequential (`workers: 1`, no serial group, retries 0).
The fixture reads the LATEST saved state when each test starts, not one stale
snapshot for the whole run. After screenshots/test hooks, it closes pages to
stop background refresh timers and writes refreshed cookies for the next test.
This also checkpoints after ordinary test failures before Playwright restarts
its worker. A failed login setup still blocks dependent tests, as it should.

This addresses the observed risk of reusing an old refresh cookie. It is not
confirmation that DoneHai rotates tokens; the backend developer must confirm
rotation/single-session rules. If a refresh is rejected, unfinished, or redirects
to login, the fixture avoids saving questionable state and prints a clear message.
There is no hidden OTP login before every test. Do not enable parallel workers
until account/session isolation has been designed.

## Reports

`npm run report` opens the HTML report. Each test has its own pass/fail result,
duration and screenshot. Traces and videos are enabled. The download test attaches
its CSV. Inspect assertions and actual data, not only a green result. Browser
actions wait through assertions; slowMo is only for visual demonstration.

Reports/traces can contain personnel details or authentication data; share them
only with the authorized team. `.env`, auth state and generated reports are ignored.

## GitHub Actions CI/CD

The `DoneHai Playwright CI` workflow in
[.github/workflows/playwright.yml](./.github/workflows/playwright.yml) runs on
pushes to `main`, pull requests targeting `main`, nightly at 02:00 IST, and
manual dispatch (choose `regression` or `smoke`). A `Static checks` job
type-checks the code and runs the staging deployment-script self-tests; only if
it passes does the `E2E` job run the `@smoke` attendance and tour tests (pull
requests) or the `@regression` attendance and tour tests (everything else). Tour
tests compare each status tab against the All tab for the last 30 days, so
staging needs some tour records in that window. It uploads the Playwright
report and test evidence. Configure `BASE_URL`, `TEST_IDENTIFIER`, and
`TEST_OTP` as repository Actions secrets; they must belong to the approved
staging account/environment. E2E runs are serialized through one concurrency
group because the fixed-OTP account does not support parallel sessions, and they
are skipped for pull requests from forks, which cannot read the secrets.

Staging candidate deployment is handled separately by
[.github/workflows/st-candidate-deploy.yml](./.github/workflows/st-candidate-deploy.yml).
It is manually dispatched or triggered by the app repository's
`repository_dispatch`, deploys an isolated candidate on the ST self-hosted
runner, and runs the Playwright gate against it. It fails closed unless
`ST_CANDIDATE_DEPLOY_ENABLED` and the required runner/secrets are configured.
Public ST traffic switching is an additional, disabled-by-default gate requiring
both `ST_TRAFFIC_SWITCH_ENABLED` and `ST_ISOLATION_PROFILE_VALIDATED`. Follow
[deployment/st-ci/DEPLOYMENT.md](./deployment/st-ci/DEPLOYMENT.md) before enabling
those settings. This CD flow deploys the application candidate to staging; it
does not deploy this automation repository or promote to production.

## Current verification

See VALIDATION.md for what was actually checked in the build environment. This
new independent-session version still needs your staging run. Your Windows files
and the remote application have not been modified by creating this package.

## Future modules

Later add pages/TourPage.ts and tests/tour/tour.spec.ts, and import the shared
`test`/`expect` from fixtures/auth.ts. The Chromium project already discovers
all `tests/**/*.spec.ts`; no second project is needed for each module. CI/CD can
be introduced later after these local tests run reliably.
