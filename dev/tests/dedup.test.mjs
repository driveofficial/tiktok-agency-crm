// code.gs dedup canonicalization — extractHandle/onlyDigits are what let the duplicate check
// match the same creator across different TikTok link formats and phone formats. They break
// silently (just stops warning about a real duplicate), so pin them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServer } from './harness.mjs';

const S = await loadServer();

test('extractHandle: canonical @username across link formats', () => {
  assert.equal(S.extractHandle('https://www.tiktok.com/@skay5546?lang=th'), '@skay5546'); // full + query + www
  assert.equal(S.extractHandle('tiktok.com/@ABC'), '@abc');                               // no scheme + uppercase
  assert.equal(S.extractHandle('@Skay5546'), '@skay5546');                                // bare @handle, lowercased
  assert.equal(S.extractHandle('skay5546'), '@skay5546');                                 // handle only
});

test('extractHandle: non-handles resolve to empty (no false match)', () => {
  assert.equal(S.extractHandle('https://vt.tiktok.com/ZSabc'), ''); // shortlink has no @username
  assert.equal(S.extractHandle('น้องแนน'), '');                     // Thai name is not a handle (server)
  assert.equal(S.extractHandle('-'), '');
  assert.equal(S.extractHandle(''), '');
  assert.equal(S.extractHandle(null), '');
});

test('onlyDigits: strips formatting so phone numbers compare equal', () => {
  assert.equal(S.onlyDigits('081-234 5678'), '0812345678');
  assert.equal(S.onlyDigits('(081) 234-5678'), '0812345678');
  assert.equal(S.onlyDigits('ไม่มี'), '');
  assert.equal(S.onlyDigits(null), '');
});
