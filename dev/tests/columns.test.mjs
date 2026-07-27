// utils.html — fuzzy Thai header matching + display/pipeline derivation. These break silently when
// a sheet's headers drift, so they're the client-side pure code most worth pinning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadClient } from './harness.mjs';

const W = await loadClient();

test('getColumnConfig: exact header hit', () => {
  assert.equal(W.getColumnConfig('สถานะ').key, 'สถานะ');
  assert.equal(W.getColumnConfig('สถานะ').config.type, 'select');
});

test('getColumnConfig: fuzzy variants map to canonical key', () => {
  assert.equal(W.getColumnConfig('สถานะการติดต่อ').key, 'สถานะ');   // includes สถานะ
  assert.equal(W.getColumnConfig('วันที่ทัก').key, 'ทัก/ยังไม่ทัก'); // includes ทัก
  assert.equal(W.getColumnConfig('ส่งของถึงยัง?').key, 'ส่งของถึงยัง');
  assert.equal(W.getColumnConfig('ลงคลิปหรือยัง').key, 'ลงคลิปยัง');
});

test('getColumnConfig: unknown header -> null', () => {
  assert.equal(W.getColumnConfig('เบอร์โทร'), null);
  assert.equal(W.getColumnConfig(''), null);
});

test('extractTiktokUsername: link / handle / plain / non-matching', () => {
  assert.equal(W.extractTiktokUsername('https://www.tiktok.com/@skay5546?lang=th'), '@skay5546');
  assert.equal(W.extractTiktokUsername('@skay5546'), '@skay5546');
  assert.equal(W.extractTiktokUsername('skay5546'), '@skay5546');
  assert.equal(W.extractTiktokUsername('https://vt.tiktok.com/ZSabc'), ''); // shortlink, no username
  assert.equal(W.extractTiktokUsername('น้องแนน'), 'น้องแนน');            // Thai name, unchanged
  assert.equal(W.extractTiktokUsername('-'), '');
});

const H = ['ชื่อเล่น', 'ชื่อเล่นTiktok (วางลิงค์ช่อง)', 'ทัก/ยังไม่ทัก', 'สถานะ', 'ส่งของถึงยัง', 'ได้รับของวันไหน', 'ลงคลิปยัง'];
const rowWith = (o) => H.map(h => o[h] ?? '');

test('getDisplayName: nickname wins over link', () => {
  assert.equal(W.getDisplayName(H, rowWith({ 'ชื่อเล่น': 'มายด์', 'ชื่อเล่นTiktok (วางลิงค์ช่อง)': 'https://tiktok.com/@mind' })), 'มายด์');
});

test('getDisplayName: falls back to @handle then ไม่ระบุชื่อ', () => {
  assert.equal(W.getDisplayName(H, rowWith({ 'ชื่อเล่นTiktok (วางลิงค์ช่อง)': 'https://tiktok.com/@mind' })), '@mind');
  assert.equal(W.getDisplayName(H, rowWith({})), 'ไม่ระบุชื่อ');
});

test('getPipelineStage: dropped outcomes', () => {
  assert.equal(W.getPipelineStage(H, rowWith({ 'สถานะ': 'ไม่รับข้อเสนอ' })).dropped, true);
  assert.equal(W.getPipelineStage(H, rowWith({ 'สถานะ': 'ไม่รับ / มีเรทการ์ด' })).dropped, true);
  assert.equal(W.getPipelineStage(H, rowWith({ 'สถานะ': 'อ่าน แต่ไม่ตอบ' })).label, 'อ่านแต่ไม่ตอบ');
});

test('getPipelineStage: progression indices', () => {
  assert.equal(W.getPipelineStage(H, rowWith({})).index, 0);                                   // ยังไม่ทัก
  assert.equal(W.getPipelineStage(H, rowWith({ 'ทัก/ยังไม่ทัก': 'ทักแล้ว' })).index, 1);        // รอตอบ
  assert.equal(W.getPipelineStage(H, rowWith({ 'สถานะ': 'รับข้อเสนอ' })).index, 2);             // accepted
  assert.equal(W.getPipelineStage(H, rowWith({ 'สถานะ': 'รับข้อเสนอ', 'ส่งของถึงยัง': 'ส่งแล้ว' })).index, 3); // shipping
  assert.equal(W.getPipelineStage(H, rowWith({ 'สถานะ': 'ดีลจบ' })).index, 4);                  // closed
});
