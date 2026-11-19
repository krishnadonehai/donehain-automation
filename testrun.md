# DoneHai test commands

Login once first. Later commands reuse that session and do not ask for OTP again.

```powershell
npm run test:login
```

Same login with a visible browser:

```powershell
npx.cmd playwright test tests/auth.setup.ts --project=setup --headed
```

If the session expires, run login again, then rerun the module.

---

## 1. Run one module

Attendance:

```powershell
npx.cmd playwright test tests/attendance/ --project=chromium --headed
```

Dashboard (the page after login):

```powershell
npx.cmd playwright test tests/dashboard/ --project=chromium --headed
```

Tour:

```powershell
npx.cmd playwright test tests/tour/ --project=chromium --headed
```

Claims:

```powershell
npx.cmd playwright test tests/claims/ --project=chromium --headed
```

RCPA (Field Voices):

```powershell
npx.cmd playwright test tests/rcpa/ --project=chromium --headed
```

DCR:

```powershell
npx.cmd playwright test tests/dcr/ --project=chromium --headed
```

Menu smoke:

```powershell
npx.cmd playwright test tests/menu/ --project=chromium --headed
```

STP:

```powershell
npx.cmd playwright test tests/stp/ --project=chromium --headed
```

MTP:

```powershell
npx.cmd playwright test tests/mtp/ --project=chromium --headed
```

Reports:

```powershell
npx.cmd playwright test tests/reports/ --project=chromium --headed
```

Team:

```powershell
npx.cmd playwright test tests/team/ --project=chromium --headed
```

CRM:

```powershell
npx.cmd playwright test tests/crm/ --project=chromium --headed
```

Territory:

```powershell
npx.cmd playwright test tests/territory/ --project=chromium --headed
```

SKU Master:

```powershell
npx.cmd playwright test tests/sku/ --project=chromium --headed
```

Knowledge:

```powershell
npx.cmd playwright test tests/knowledge/ --project=chromium --headed
```

Team + CRM + Territory + SKU + Knowledge together:

```powershell
npm run test:modules
```

Without opening the browser, replace `--headed` with nothing, or set:

```powershell
$env:HEADLESS="true"
```

---

## 2. Run all modules (one command)

```powershell
npm test
```

Same with a visible browser:

```powershell
npx.cmd playwright test --project=chromium --headed
```

Headless / faster:

```powershell
$env:HEADLESS="true"; npm test
```

---

## 3. Run API only

```powershell
npm run test:api
```

Same with the list reporter:

```powershell
npx.cmd playwright test tests/api/api-health.spec.ts --project=chromium --reporter=list
```

---

## Report

```powershell
npm run report
```
