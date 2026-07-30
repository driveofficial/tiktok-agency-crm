#!/usr/bin/env node
// resync-all-tabs.mjs — sync ใหม่ทั้ง 4 แท็บจาก Google Sheet เข้า Supabase (full-replace ต่อแท็บ)
// ใช้แก้ข้อมูลที่ตัดทอน/ไม่ครบจาก trigger fan-out ตอน 2026-07-29
// (sheet-push trigger ถูกลบไปแล้ว ณ ตอนที่เขียนสคริปต์นี้ — ไม่มี race ระหว่าง resync)
//
// ใช้:
//   SHEET_SYNC_SECRET=<secret จริง> node backend/scripts/resync-all-tabs.mjs

import fs from 'node:fs';
import crypto from 'node:crypto';

const SA_KEY_PATH = process.env.SA_KEY_PATH || 'silent-emissary-485208-f8-4b1b1bcafc09.json';
const SPREADSHEET_ID = '1uGNuLClySwpkENlbi1lPIbDeL-q06uF2N8P9neXTKbU';
const TEAM_NAME = 'ทักอินฟูรับคอมมิชชั่น 10%';
const TABS = ['อาร์ม', 'ซัน', 'โอ๊ค', 'ตี๋น้อย'];
const WEBHOOK_URL = 'https://fxjaeqeuxdlnwyxwrozf.supabase.co/functions/v1/sheet-sync';

const secret = process.env.SHEET_SYNC_SECRET;
if (!secret) {
  console.error('missing SHEET_SYNC_SECRET env var. usage: SHEET_SYNC_SECRET=<secret> node resync-all-tabs.mjs');
  process.exit(1);
}

const sa = JSON.parse(fs.readFileSync(SA_KEY_PATH, 'utf8'));

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    sub: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claim));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const sig = signer.sign(sa.private_key).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = unsigned + '.' + sig;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error('token error: ' + JSON.stringify(body));
  return body.access_token;
}

async function fetchTabValues(token, tabName) {
  const range = encodeURIComponent(tabName);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json();
  if (!res.ok) throw new Error(`sheets api error (${tabName}): ${JSON.stringify(body)}`);
  return body.values ?? [];
}

async function main() {
  const token = await getAccessToken();

  for (const tab of TABS) {
    const values = await fetchTabValues(token, tab);
    const headers = values[0] ?? [];
    const rows = values.slice(1);
    console.log(`${tab}: read ${rows.length} rows, ${headers.length} cols from Sheet`);

    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': secret },
      body: JSON.stringify({ sheets: [{ team: TEAM_NAME, label: tab, headers, rows }] }),
    });
    const body = await res.json();
    if (!res.ok || !body.ok) throw new Error(`sheet-sync error (${tab}): ${JSON.stringify(body)}`);
    console.log(`  -> resynced: ${JSON.stringify(body)}`);
  }
  console.log('done — all 4 tabs resynced from Sheet');
}

main().catch((e) => { console.error(e); process.exit(1); });
