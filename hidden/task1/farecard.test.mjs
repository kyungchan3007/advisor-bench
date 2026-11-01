// 과제 1 숨은 테스트 36개 — FARECARD_DIR 의 src/index.js 를 채점한다
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const dir = process.env.FARECARD_DIR;
const lib = await import(pathToFileURL(path.join(dir, 'src/index.js')).href);
const { distanceFare, fareFor, groupTrips, settle, toCsv } = lib;

const R = (from, to, board, alight) => ({ from, to, board: `2026-11-03 ${board}`, alight: `2026-11-03 ${alight}` });

// ---- 1. 거리 운임 (8) ----
test('거리 5km', () => assert.equal(distanceFare(5), 1450));
test('거리 10km 경계', () => assert.equal(distanceFare(10), 1450));
test('거리 12km', () => assert.equal(distanceFare(12), 1550));
test('거리 15km 경계', () => assert.equal(distanceFare(15), 1550));
test('거리 15.1km', () => assert.equal(distanceFare(15.1), 1650));
test('거리 50km 경계', () => assert.equal(distanceFare(50), 2250));
test('거리 51km', () => assert.equal(distanceFare(51), 2350));
test('거리 58km 경계', () => assert.equal(distanceFare(58), 2350));

// ---- 2. 승객 유형 (8) ----
test('어른 8km', () => assert.equal(fareFor(8, 'adult'), 1450));
test('어른 기본값', () => assert.equal(fareFor(20), 1650));
test('청소년 8km', () => assert.equal(fareFor(8, 'youth'), 1160));
test('청소년 추가운임은 할인 없음', () => assert.equal(fareFor(20, 'youth'), 1360));
test('어린이 10원 미만 버림', () => assert.equal(fareFor(8, 'child'), 720));
test('어린이 추가운임', () => assert.equal(fareFor(12, 'child'), 820));
test('경로 무료', () => assert.equal(fareFor(70, 'senior'), 0));
test('모르는 유형 오류', () => assert.throws(() => fareFor(5, 'pet')));

// ---- 3. 통합환승 정산 (12) ----
test('한 번 승차', () => {
  const s = settle([R('시청', '을지로', '08:00', '08:10')]);
  assert.equal(s.total, 1450);
  assert.equal(s.rides[0].transfer, false);
});
test('30분 넘으면 새 통행', () => {
  const s = settle([R('시청', '을지로', '08:00', '08:10'), R('동대문', '성수', '08:41', '08:55')]);
  assert.deepEqual(s.rides.map((r) => r.fare), [1450, 1450]);
});
test('환승이면 거리 합산', () => {
  const s = settle([R('시청', '을지로', '08:00', '08:10'), R('동대문', '성수', '08:20', '08:35')]);
  // 3.4 + 7.2 = 10.6km → 1,550원
  assert.deepEqual(s.rides.map((r) => r.fare), [1450, 100]);
  assert.equal(s.total, 1550);
});
test('환승 표시', () => {
  const s = settle([R('시청', '을지로', '08:00', '08:10'), R('동대문', '성수', '08:20', '08:35')]);
  assert.deepEqual(s.rides.map((r) => r.transfer), [false, true]);
});
test('30분 정각은 환승', () => {
  const s = settle([R('시청', '을지로', '08:00', '08:10'), R('동대문', '성수', '08:40', '08:55')]);
  assert.equal(s.rides[1].transfer, true);
});
test('환승 승차 0원', () => {
  const s = settle([R('교대', '강남', '09:00', '09:05'), R('잠실', '천호', '09:15', '09:25')]);
  // 2.1 + 5.3 = 7.4km
  assert.deepEqual(s.rides.map((r) => r.fare), [1450, 0]);
});
test('입력 순서가 섞여도 승차 시각 순', () => {
  const s = settle([R('동대문', '성수', '08:20', '08:35'), R('시청', '을지로', '08:00', '08:10')]);
  assert.deepEqual(s.rides.map((r) => r.from), ['시청', '동대문']);
  assert.equal(s.total, 1550);
});
test('환승 4회까지, 다섯 번째는 새 통행', () => {
  const rides = [
    R('홍대', '신촌', '07:00', '07:03'),
    R('시청', '을지로', '07:10', '07:15'),
    R('동대문', '청량리', '07:20', '07:25'),
    R('성수', '건대', '07:30', '07:33'),
    R('잠실', '천호', '07:40', '07:45'),
    R('강남', '교대', '07:50', '07:53'),
  ];
  const s = settle(rides);
  assert.deepEqual(s.rides.map((r) => r.transfer), [false, true, true, true, true, false]);
});
test('같은 역 재승차는 환승 아님', () => {
  const s = settle([R('시청', '을지로', '08:00', '08:10'), R('을지로', '동대문', '08:15', '08:20')]);
  assert.deepEqual(s.rides.map((r) => r.fare), [1450, 1450]);
});
test('거리 합산 반올림 (15.0km 경계)', () => {
  // 2.8 + 10.8 + 1.4 = 15.0 (그냥 더하면 15.000000000000002)
  const s = settle([R('을지로', '동대문', '08:00', '08:05'), R('강남', '수서', '08:10', '08:25'), R('홍대', '신촌', '08:30', '08:33')]);
  assert.equal(s.total, 1550);
});
test('청소년 환승 정산', () => {
  const s = settle([R('시청', '을지로', '08:00', '08:10'), R('동대문', '성수', '08:20', '08:35')], 'youth');
  assert.deepEqual(s.rides.map((r) => r.fare), [1160, 100]);
});
test('groupTrips 묶음', () => {
  const trips = groupTrips([R('시청', '을지로', '08:00', '08:10'), R('동대문', '성수', '08:20', '08:35'), R('강남', '교대', '12:00', '12:05')]);
  assert.deepEqual(trips.map((t) => t.length), [2, 1]);
});

// ---- 4. CSV (8) ----
const day = () =>
  settle([R('시청', '을지로', '08:00', '08:10'), R('동대문', '성수', '08:20', '08:35'), R('청량리', '어린이대공원"정문"', '18:00', '18:12')]);
const rows = () => toCsv(day()).split('\n');

test('CSV 머리글', () => assert.equal(rows()[0], '일시,승차역,하차역,거리,요금,환승'));
test('CSV 첫 줄', () => assert.equal(rows()[1], '2026-11-03 08:00,시청,을지로,3.4,1450,N'));
test('CSV 환승 줄', () => assert.equal(rows()[2], '2026-11-03 08:20,동대문,성수,7.2,100,Y'));
test('CSV 따옴표 이스케이프', () => assert.equal(rows()[3], '2026-11-03 18:00,청량리,"어린이대공원""정문""",6.1,1450,N'));
test('CSV 합계 줄', () => assert.equal(rows()[4], '합계,,,16.7,3000,'));
test('CSV 끝 줄바꿈', () => assert.ok(toCsv(day()).endsWith(',\n')));
test('CSV 쉼표 이스케이프', () => {
  const csv = toCsv(settle([R('시청', '시청(광장,정문)', '09:00', '09:02')]));
  assert.equal(csv.split('\n')[1], '2026-11-03 09:00,시청,"시청(광장,정문)",0.6,1450,N');
});
test('CSV 거리 소수 고정', () => {
  const csv = toCsv(settle([R('을지로', '성수', '09:00', '09:12')]));
  assert.equal(csv.split('\n')[1], '2026-11-03 09:00,을지로,성수,10.0,1450,N');
});
