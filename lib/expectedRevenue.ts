/**
 * calcExpectedRevenue
 *
 * Calculates the forecasted (expected) revenue from active subscriptions
 * for a given period. This is separate from "unpaid" (actual debt from
 * lessons already held) and from "paid" (already received).
 *
 * Algorithm:
 * - week / custom: sum of lesson-slot prices scheduled in the period
 *   for active students who have NOT yet been billed for those lessons.
 * - month: sum of full subscription prices for active students whose
 *   subscription renewal falls within this month (based on abonStart cycle).
 * - year: sum of (remaining months × monthly subscription price) for
 *   all active students.
 */

export interface StudentForForecast {
  id: string;
  status: string;       // 'active' | 'reserve' | 'left'
  isFrozen?: boolean;
  tariffId?: string;
  abonStart?: string;   // ISO date string YYYY-MM-DD
  balance: number;      // lessons remaining in current cycle
  paymentHistory?: { amount: number; date: string }[];
}

export interface TariffForForecast {
  id: string;
  lessons: number;
  price: number;
}

export interface LessonForForecast {
  studentId: string;
  date: string;         // YYYY-MM-DD
  lessonType: string;
  isFreeSlot?: boolean;
  studentName?: string;
}

export type ForecastPeriod = 'week' | 'month' | 'year' | 'custom';

export interface ForecastParams {
  period: ForecastPeriod;
  startStr: string;     // YYYY-MM-DD  (inclusive)
  endStr: string;       // YYYY-MM-DD  (inclusive)
  students: StudentForForecast[];
  tariffs: TariffForForecast[];
  lessons: LessonForForecast[];
  systemStudentNames?: string[];
}

const SYSTEM_NAMES = ['System Block', 'Перерыв', 'Дела'];

function isActiveStudent(s: StudentForForecast): boolean {
  return s.status === 'active' && !s.isFrozen;
}

function pricePerLesson(t: TariffForForecast): number {
  return t.lessons > 0 ? t.price / t.lessons : 0;
}

/** Count user lessons in [start, end] for a student */
function lessonsInPeriod(
  studentId: string,
  startStr: string,
  endStr: string,
  lessons: LessonForForecast[]
): number {
  const billableTypes = ['regular', 'one_time', 'single'];
  return lessons.filter(
    (l) =>
      l.studentId === studentId &&
      l.date >= startStr &&
      l.date <= endStr &&
      !l.isFreeSlot &&
      billableTypes.includes(l.lessonType)
  ).length;
}

/** How many full lessons have already been paid for a student up to endStr */
function paidLessonsUpTo(s: StudentForForecast, endStr: string): number {
  if (!s.paymentHistory) return 0;
  return s.paymentHistory
    .filter((p) => p.date <= endStr && p.amount > 0)
    .reduce((sum, p) => sum + p.amount, 0);
}

/**
 * Week / custom period forecast:
 * For each active student, count lessons scheduled in the period.
 * Subtract lessons already covered by existing payments.
 * Round up to full tariff subscriptions — never per-lesson.
 */
function forecastWeekCustom(params: ForecastParams): number {
  const { startStr, endStr, students, tariffs, lessons, systemStudentNames } = params;
  const sysNames = systemStudentNames ?? SYSTEM_NAMES;
  let total = 0;

  students
    .filter((s) => isActiveStudent(s) && !sysNames.includes(s.id))
    .forEach((s) => {
      const t = tariffs.find((x) => x.id === s.tariffId);
      if (!t || t.lessons === 0) return;

      const scheduledInPeriod = lessonsInPeriod(s.id, startStr, endStr, lessons);
      if (scheduledInPeriod === 0) return;

      // Lessons already covered by payments before/during the period
      const allLessonsUpToEnd = lessonsInPeriod(s.id, '2000-01-01', endStr, lessons);
      const paid = paidLessonsUpTo(s, endStr);
      const lessonsBeforePeriod = allLessonsUpToEnd - scheduledInPeriod;
      const coveredInPeriod = Math.max(0, paid - lessonsBeforePeriod);
      const unpaidInPeriod = Math.max(0, scheduledInPeriod - coveredInPeriod);

      if (unpaidInPeriod === 0) return;

      // Full tariff price — ceil to whole subscriptions
      total += Math.ceil(unpaidInPeriod / t.lessons) * t.price;
    });

  return Math.round(total);
}

/**
 * Month forecast:
 * For each active student who has scheduled lessons in the month
 * and has not fully paid for them — expect one full tariff renewal.
 * Uses full tariff price, not per-lesson price.
 */
function forecastMonth(params: ForecastParams): number {
  const { startStr, endStr, students, tariffs, lessons, systemStudentNames } = params;
  const sysNames = systemStudentNames ?? SYSTEM_NAMES;
  let total = 0;

  students
    .filter((s) => isActiveStudent(s) && !sysNames.includes(s.id))
    .forEach((s) => {
      const t = tariffs.find((x) => x.id === s.tariffId);
      if (!t || t.lessons === 0) return;

      // Lessons scheduled in this month for the student
      const scheduledInMonth = lessonsInPeriod(s.id, startStr, endStr, lessons);
      if (scheduledInMonth === 0) return;

      // Total lessons paid up to end of month
      const paid = paidLessonsUpTo(s, endStr);
      // Total lessons up to end of month (to determine how many are covered)
      const allUpToEnd = lessonsInPeriod(s.id, '2000-01-01', endStr, lessons);
      // Lessons before this month that already consumed payment
      const beforeMonth = allUpToEnd - scheduledInMonth;
      // How many lessons in this month are covered by existing payments
      const coveredInMonth = Math.max(0, paid - beforeMonth);
      const unpaidInMonth = Math.max(0, scheduledInMonth - coveredInMonth);

      if (unpaidInMonth === 0) return;

      // Count whole tariff renewals needed to cover the unpaid lessons
      total += Math.ceil(unpaidInMonth / t.lessons) * t.price;
    });

  return Math.round(total);
}

/**
 * Year forecast:
 * For each active student with a tariff — 1 full subscription price
 * per each remaining month of the year (current month excluded).
 * e.g. today = May → remaining = Jun..Dec = 7 months → 7 × tariff.price
 */
function forecastYear(params: ForecastParams): number {
  const { students, tariffs, systemStudentNames } = params;
  const sysNames = systemStudentNames ?? SYSTEM_NAMES;
  const today = new Date();

  // Remaining whole months after current month up to December
  // e.g. May (month=4) → 11 - 4 = 7 months (Jun..Dec)
  const currentMonth = today.getMonth(); // 0=Jan … 11=Dec
  const remainingMonths = 11 - currentMonth;

  if (remainingMonths <= 0) return 0;

  let total = 0;

  students
    .filter((s) => isActiveStudent(s) && !sysNames.includes(s.id))
    .forEach((s) => {
      const t = tariffs.find((x) => x.id === s.tariffId);
      if (!t || t.lessons === 0) return;

      // 1 full subscription per remaining month
      total += remainingMonths * t.price;
    });

  return Math.round(total);
}

export function calcExpectedRevenue(params: ForecastParams): number {
  switch (params.period) {
    case 'year':
      return forecastYear(params);
    case 'month':
      return forecastMonth(params);
    case 'week':
    case 'custom':
    default:
      return forecastWeekCustom(params);
  }
}
