// make-fixtures.js — writes the small fictional fixtures used by window.__demo and tests/smoke.spec.js.
// Run with: node tests/make-fixtures.js
const fs = require('fs');
const path = require('path');

const log = `Support log, week 11 (fictional data)
[2026-03-14 09:12] order 4821 shipped to Lena Ortiz
[2026-03-14 10:47] ticket 377 opened by Marco Bellini: parcel arrived damaged
[2026-03-15 08:05] order 4822 refunded to Priya Halden, amount 59.90
[2026-03-15 14:22] order 4830 shipped to Tomas Reyes, label color #3fa7c2
[2026-03-16 11:58] contact updated for Lena Ortiz: lena.ortiz@example.test
[2026-03-17 16:30] order 4835 delayed, new ETA 2026-03-21, badge #f90
`;

fs.writeFileSync(path.join(__dirname, 'fixtures', 'support-log.txt'), log);
console.log('wrote tests/fixtures/support-log.txt');
