// code.gs date logic — the Thai พ.ศ./ค.ศ. mix is the highest-risk pure code in the app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServer } from './harness.mjs';

const S = await loadServer();

test('normYear: พ.ศ. (>=2400) converts to ค.ศ.; ค.ศ. untouched', () => {
  assert.equal(S.normYear(2569), 2026);   // Buddhist era -> Gregorian
  assert.equal(S.normYear(2026), 2026);   // already Gregorian
  assert.equal(S.normYear(2400), 1857);   // boundary: >=2400 converts
  assert.equal(S.normYear(2399), 2399);   // just below boundary: untouched
});

test('parseDate: ISO YYYY-MM-DD', () => {
  const d = S.parseDate('2026-07-27');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 6);          // 0-based July
  assert.equal(d.getDate(), 27);
});

test('parseDate: Thai DD/MM/YYYY with พ.ศ. year', () => {
  const d = S.parseDate('27/07/2569');
  assert.equal(d.getFullYear(), 2026);    // 2569 - 543
  assert.equal(d.getMonth(), 6);
  assert.equal(d.getDate(), 27);
});

test('parseDate: single-digit D/M/YYYY', () => {
  const d = S.parseDate('5/3/2026');
  assert.equal(d.getMonth(), 2);          // March
  assert.equal(d.getDate(), 5);
});

test('parseDate: empty / invalid -> null', () => {
  assert.equal(S.parseDate(''), null);
  assert.equal(S.parseDate(null), null);
  assert.equal(S.parseDate('ไม่ระบุ'), null);
});

test('formatDateISO: zero-pads month and day', () => {
  assert.equal(S.formatDateISO(new Date(2026, 0, 5)), '2026-01-05');
});

test('getStartOfWeek: Monday-based (Sunday rolls back to prev Monday)', () => {
  // Sunday 2026-07-26 -> week starts Monday 2026-07-20
  assert.equal(S.formatDateISO(S.getStartOfWeek(new Date(2026, 6, 26))), '2026-07-20');
  // Monday 2026-07-27 -> itself
  assert.equal(S.formatDateISO(S.getStartOfWeek(new Date(2026, 6, 27))), '2026-07-27');
});
