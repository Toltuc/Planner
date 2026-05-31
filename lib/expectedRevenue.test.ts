/**
 * Unit tests for calcExpectedRevenue
 * Run with: npx ts-node -e "require('./lib/expectedRevenue.test')"
 * Or after adding jest: npx jest lib/expectedRevenue.test.ts
 */

import { calcExpectedRevenue, ForecastParams } from './expectedRevenue';

// ─── Helpers ────────────────────────────────────────────────────────────────

const TARIFF_8 = { id: 't1', lessons: 8, price: 4000 };  // 500 ₽/lesson
const TARIFF_4 = { id: 't2', lessons: 4, price: 2400 };  // 600 ₽/lesson

function makeStudent(id: string, tariffId: string, balance = 8, overrides: object = {}) {
  return { id, status: 'active', isFrozen: false, tariffId, balance, paymentHistory: [], ...overrides };
}

function makeLesson(studentId: string, date: string, lessonType = 'regular') {
  return { studentId, date, lessonType, isFreeSlot: false };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

function expect(actual: number) {
  return {
    toBe(expected: number) {
      if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
    },
    toBeGreaterThan(n: number) {
      if (actual <= n) throw new Error(`Expected > ${n}, got ${actual}`);
    },
    toBeLessThan(n: number) {
      if (actual >= n) throw new Error(`Expected < ${n}, got ${actual}`);
    },
  };
}

// ─── Week tests ───────────────────────────────────────────────────────────────

console.log('\n[Week / Custom period]');

test('returns 0 when no lessons in period', () => {
  const params: ForecastParams = {
    period: 'week',
    startStr: '2026-06-01',
    endStr: '2026-06-07',
    students: [makeStudent('s1', 't1')],
    tariffs: [TARIFF_8],
    lessons: [makeLesson('s1', '2026-07-01')], // outside period
  };
  expect(calcExpectedRevenue(params)).toBe(0);
});

test('returns full lesson price for 1 unpaid lesson in period', () => {
  // 1 lesson × 500 ₽ = 500 ₽
  const params: ForecastParams = {
    period: 'week',
    startStr: '2026-06-01',
    endStr: '2026-06-07',
    students: [makeStudent('s1', 't1', 0)],
    tariffs: [TARIFF_8],
    lessons: [makeLesson('s1', '2026-06-03')],
  };
  expect(calcExpectedRevenue(params)).toBe(500);
});

test('returns 0 when lesson is already paid', () => {
  // 1 payment of 1 lesson before period end — lesson is covered
  const student = makeStudent('s1', 't1', 1, {
    paymentHistory: [{ amount: 1, date: '2026-06-02' }],
  });
  const params: ForecastParams = {
    period: 'week',
    startStr: '2026-06-01',
    endStr: '2026-06-07',
    students: [student],
    tariffs: [TARIFF_8],
    lessons: [makeLesson('s1', '2026-06-03')],
  };
  expect(calcExpectedRevenue(params)).toBe(0);
});

test('counts only unpaid lessons in period when partial payment exists', () => {
  // 4 lessons in period, 2 already paid before period → 2 unpaid × 500 = 1000
  const student = makeStudent('s1', 't1', 4, {
    paymentHistory: [{ amount: 4, date: '2026-05-01' }], // 4 lessons paid before period
  });
  const periodLessons = [
    makeLesson('s1', '2026-06-01'),
    makeLesson('s1', '2026-06-02'),
    makeLesson('s1', '2026-06-03'),
    makeLesson('s1', '2026-06-04'),
  ];
  // 4 paid lessons cover first 4 total lessons. 4 lessons before period = 0 (no lessons before).
  // So all 4 in period are covered → 0
  const params: ForecastParams = {
    period: 'week',
    startStr: '2026-06-01',
    endStr: '2026-06-07',
    students: [student],
    tariffs: [TARIFF_8],
    lessons: periodLessons,
  };
  expect(calcExpectedRevenue(params)).toBe(0);
});

test('sums multiple active students correctly', () => {
  // s1: 2 unpaid lessons × 500 = 1000; s2: 1 unpaid × 600 = 600 → total 1600
  const s1 = makeStudent('s1', 't1', 0);
  const s2 = makeStudent('s2', 't2', 0);
  const params: ForecastParams = {
    period: 'week',
    startStr: '2026-06-01',
    endStr: '2026-06-07',
    students: [s1, s2],
    tariffs: [TARIFF_8, TARIFF_4],
    lessons: [
      makeLesson('s1', '2026-06-02'),
      makeLesson('s1', '2026-06-04'),
      makeLesson('s2', '2026-06-03'),
    ],
  };
  expect(calcExpectedRevenue(params)).toBe(1600);
});

test('skips frozen students', () => {
  const frozen = makeStudent('s1', 't1', 8, { isFrozen: true });
  const params: ForecastParams = {
    period: 'week',
    startStr: '2026-06-01',
    endStr: '2026-06-07',
    students: [frozen],
    tariffs: [TARIFF_8],
    lessons: [makeLesson('s1', '2026-06-03')],
  };
  expect(calcExpectedRevenue(params)).toBe(0);
});

test('skips reserve students', () => {
  const reserve = makeStudent('s1', 't1', 8, { status: 'reserve' });
  const params: ForecastParams = {
    period: 'week',
    startStr: '2026-06-01',
    endStr: '2026-06-07',
    students: [reserve],
    tariffs: [TARIFF_8],
    lessons: [makeLesson('s1', '2026-06-03')],
  };
  expect(calcExpectedRevenue(params)).toBe(0);
});

test('calendar isolation: lessons outside period not counted', () => {
  // Lessons only in July, period is June
  const params: ForecastParams = {
    period: 'month',
    startStr: '2026-06-01',
    endStr: '2026-06-30',
    students: [makeStudent('s1', 't1')],
    tariffs: [TARIFF_8],
    lessons: [
      makeLesson('s1', '2026-07-01'),
      makeLesson('s1', '2026-07-08'),
    ],
  };
  expect(calcExpectedRevenue(params)).toBe(0);
});

// ─── Year tests ───────────────────────────────────────────────────────────────

console.log('\n[Year period]');

test('year forecast is greater than 0 for active students with recent lessons', () => {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const last7 = new Date(today);
  last7.setDate(last7.getDate() - 7);
  const last7Str = last7.toISOString().split('T')[0];

  const params: ForecastParams = {
    period: 'year',
    startStr: `${today.getFullYear()}-01-01`,
    endStr: `${today.getFullYear()}-12-31`,
    students: [makeStudent('s1', 't1', 8)],
    tariffs: [TARIFF_8],
    lessons: [
      makeLesson('s1', last7Str),   // recent lesson
      makeLesson('s1', todayStr),
    ],
  };
  expect(calcExpectedRevenue(params)).toBeGreaterThan(0);
});

test('year forecast rounds to integer', () => {
  const today = new Date();
  const lastMonth = new Date(today);
  lastMonth.setDate(lastMonth.getDate() - 15);
  const params: ForecastParams = {
    period: 'year',
    startStr: `${today.getFullYear()}-01-01`,
    endStr: `${today.getFullYear()}-12-31`,
    students: [makeStudent('s1', 't1', 8)],
    tariffs: [TARIFF_8],
    lessons: [makeLesson('s1', lastMonth.toISOString().split('T')[0])],
  };
  const result = calcExpectedRevenue(params);
  expect(result).toBe(Math.round(result)); // must be integer
});

test('year forecast is 0 for students with no lessons and no tariff', () => {
  const params: ForecastParams = {
    period: 'year',
    startStr: '2026-01-01',
    endStr: '2026-12-31',
    students: [makeStudent('s1', 'nonexistent', 0)],
    tariffs: [TARIFF_8],
    lessons: [],
  };
  expect(calcExpectedRevenue(params)).toBe(0);
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
