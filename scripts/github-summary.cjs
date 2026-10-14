const fs = require('node:fs');

const path = 'test-results/results.json';
const output = process.env.GITHUB_STEP_SUMMARY;

if (!output || !fs.existsSync(path)) {
  console.log('GitHub summary unavailable.');
  process.exit(0);
}

const report = JSON.parse(fs.readFileSync(path, 'utf8'));
const stats = report.stats || {};

const tests = [];

function collect(suites) {
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const status = test.results?.at(-1)?.status || 'unknown';
        tests.push({
          name: spec.title,
          status,
        });
      }
    }
    collect(suite.suites);
  }
}

collect(report.suites);

const passed = tests.filter(t => t.status === 'passed').length;
const failed = tests.filter(t =>
  ['failed', 'timedOut', 'interrupted'].includes(t.status)
).length;
const skipped = tests.filter(t => t.status === 'skipped').length;

let summary = `# DoneHai Playwright Test Results

| Result | Count |
|---|---:|
| Passed | ${passed} |
| Failed | ${failed} |
| Skipped | ${skipped} |
| Total | ${tests.length} |

## Individual Tests

| Test Name | Status |
|---|---|
`;

for (const t of tests) {
  const icon = t.status === 'passed' ? '✅' :
    t.status === 'skipped' ? '⏭️' : '❌';

  const name = t.name.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  summary += `| ${name} | ${icon} ${t.status} |\n`;
}

fs.appendFileSync(output, summary);
console.log('GitHub test summary created.');