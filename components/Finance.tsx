'use client';

import React, { useState, useMemo } from 'react';
import {
  TrendingUp, Wallet, Sparkles,
  ChevronDown, ChevronUp, User, Calendar,
  BarChart2, Clock, X,
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useAppStore } from '@/store/appStore';
import { isUserLesson, SYSTEM_STUDENT_NAMES } from '@/types';
import { calcExpectedRevenue } from '@/lib/expectedRevenue';

type Period = 'week' | 'month' | 'year';

const MONTH_NAMES = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];

function getRange(period: Period) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case 'week': {
      const s = startOfWeek(now, { weekStartsOn: 1 });
      const e = endOfWeek(now, { weekStartsOn: 1 });
      return {
        startStr: format(s, 'yyyy-MM-dd'),
        endStr: format(e, 'yyyy-MM-dd'),
      };
    }
    case 'month':
      return {
        startStr: format(new Date(y, m, 1), 'yyyy-MM-dd'),
        endStr: format(new Date(y, m + 1, 0), 'yyyy-MM-dd'),
      };
    case 'year':
      return {
        startStr: `${y}-01-01`,
        endStr: `${y}-12-31`,
      };
  }
}

function periodLabel(period: Period) {
  const now = new Date();
  if (period === 'week') {
    const s = startOfWeek(now, { weekStartsOn: 1 });
    const e = endOfWeek(now, { weekStartsOn: 1 });
    return `${format(s, 'd MMM', { locale: ru })} – ${format(e, 'd MMM', { locale: ru })}`;
  }
  if (period === 'month') return format(now, 'LLLL yyyy', { locale: ru });
  return `${now.getFullYear()} год`;
}

interface ChartPopup {
  label: string;
  count: number;
  income: number;
  students: string[];
}

export default function Finance() {
  const students  = useAppStore(s => s.students);
  const lessons   = useAppStore(s => s.lessons);
  const tariffs   = useAppStore(s => s.tariffs);
  const isInit    = useAppStore(s => s.isInitialized);

  const [period, setPeriod] = useState<Period>('month');
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [chartPopup, setChartPopup] = useState<ChartPopup | null>(null);

  const realStudents = useMemo(
    () => students.filter(s => !SYSTEM_STUDENT_NAMES.includes(s.fullName)),
    [students]
  );

  const { startStr, endStr } = useMemo(() => getRange(period), [period]);

  // ── Actual income in period ──────────────────────────────────────────────
  const incomeAmount = useMemo(() => {
    let total = 0;
    realStudents.forEach(s => {
      if (!s.paymentHistory) return;
      const t = tariffs.find(x => x.id === s.tariffId);
      if (!t || t.lessons === 0) return;
      s.paymentHistory.forEach(p => {
        if (p.date >= startStr && p.date <= endStr && p.amount > 0) {
          // Each payment = ceil(amount / t.lessons) full subscriptions
          total += Math.ceil(p.amount / t.lessons) * t.price;
        }
      });
    });
    return Math.round(total);
  }, [realStudents, tariffs, startStr, endStr]);

  // ── Expected revenue ─────────────────────────────────────────────────────
  const expectedRevenue = useMemo(() => {
    return calcExpectedRevenue({
      period,
      startStr,
      endStr,
      students: realStudents,
      tariffs,
      lessons,
    });
  }, [period, startStr, endStr, realStudents, tariffs, lessons]);

  // ── Monthly income chart (12 months of current year) ────────────────────
  const monthlyIncome = useMemo(() => {
    const arr = Array(12).fill(0) as number[];
    const year = new Date().getFullYear();
    realStudents.forEach(s => {
      if (!s.paymentHistory) return;
      const t = tariffs.find(x => x.id === s.tariffId);
      if (!t || t.lessons === 0) return;
      s.paymentHistory.forEach(p => {
        if (!p.date.startsWith(`${year}`) || p.amount <= 0) return;
        const mo = parseInt(p.date.split('-')[1], 10) - 1;
        arr[mo] += Math.ceil(p.amount / t.lessons) * t.price;
      });
    });
    return arr.map(v => Math.round(v));
  }, [realStudents, tariffs]);

  // ── Monthly expected chart (future months) ───────────────────────────────
  const monthlyExpected = useMemo(() => {
    const arr = Array(12).fill(0) as number[];
    const now = new Date();
    const year = now.getFullYear();
    const currentMonth = now.getMonth();
    for (let mo = currentMonth + 1; mo <= 11; mo++) {
      const s = `${year}-${String(mo + 1).padStart(2, '0')}-01`;
      const e = `${year}-${String(mo + 1).padStart(2, '0')}-${new Date(year, mo + 1, 0).getDate()}`;
      arr[mo] = calcExpectedRevenue({
        period: 'month', startStr: s, endStr: e,
        students: realStudents, tariffs, lessons,
      });
    }
    return arr;
  }, [realStudents, tariffs, lessons]);

  // ── Per-student income breakdown ─────────────────────────────────────────
  const studentBreakdown = useMemo(() => {
    return realStudents
      .map(s => {
        const t = tariffs.find(x => x.id === s.tariffId);

        // Count payments in period — each payment = full tariff price
        const paymentsInPeriod = (s.paymentHistory || []).filter(
          p => p.date >= startStr && p.date <= endStr && p.amount > 0
        );
        const paidAmount = t && t.lessons > 0
          ? paymentsInPeriod.reduce((sum, p) => sum + Math.ceil(p.amount / t.lessons) * t.price, 0)
          : 0;

        // Lessons in calendar in period
        const activeLessons = lessons.filter(
          l => isUserLesson(l) && l.studentId === s.id && l.date >= startStr && l.date <= endStr
        ).length;

        const hasPaid = paymentsInPeriod.length > 0;
        const hasLessons = activeLessons > 0;

        return {
          id: s.id,
          name: s.fullName,
          paid: Math.round(paidAmount),
          lessons: activeLessons,
          tariff: t,
          hasPaid,
          hasLessons,
        };
      })
      .filter(x => x.hasPaid || x.hasLessons)
      .sort((a, b) => b.paid - a.paid);
  }, [realStudents, tariffs, lessons, startStr, endStr]);

  // ── Unpaid (debt): full tariff price for lessons not yet paid ─────────────
  const unpaidAmount = useMemo(() => {
    // Year: same logic as expectedRevenue → remainingMonths × tariff.price per active student
    if (period === 'year') {
      const today = new Date();
      const remainingMonths = 11 - today.getMonth();
      if (remainingMonths <= 0) return 0;
      let total = 0;
      realStudents.forEach(s => {
        const t = tariffs.find(x => x.id === s.tariffId);
        if (!t || t.lessons === 0) return;
        if (s.status !== 'active' || s.isFrozen) return;
        total += remainingMonths * t.price;
      });
      return total;
    }

    // Week / Month: count unpaid lessons in period → full tariff price
    let total = 0;
    realStudents.forEach(s => {
      const t = tariffs.find(x => x.id === s.tariffId);
      if (!t || t.lessons === 0) return;
      if (s.status !== 'active' || s.isFrozen) return;

      const sLessons = lessons
        .filter(l => isUserLesson(l) && l.studentId === s.id)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (sLessons.length === 0) return;

      const totalPaidLessons = (s.paymentHistory || [])
        .filter(p => p.amount > 0)
        .reduce((sum, p) => sum + p.amount, 0);

      const inPeriod = sLessons.filter(l => l.date >= startStr && l.date <= endStr);
      if (inPeriod.length === 0) return;

      const paidUpToIndex = totalPaidLessons;
      let unpaidInPeriod = 0;
      inPeriod.forEach(l => {
        const idx = sLessons.indexOf(l);
        if (idx >= paidUpToIndex) unpaidInPeriod++;
      });
      if (unpaidInPeriod === 0) return;

      total += Math.ceil(unpaidInPeriod / t.lessons) * t.price;
    });
    return total;
  }, [period, realStudents, tariffs, lessons, startStr, endStr]);

  // ── Chart click handlers ─────────────────────────────────────────────────
  const handleMonthBarClick = (monthIndex: number) => {
    const year = new Date().getFullYear();
    const mStart = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
    const mEnd   = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${new Date(year, monthIndex + 1, 0).getDate()}`;
    const monthLessons = lessons.filter(l => isUserLesson(l) && l.date >= mStart && l.date <= mEnd);
    const studentNames = Array.from(new Set(monthLessons.map(l => l.studentName))).filter(Boolean) as string[];
    const inc = monthlyIncome[monthIndex] || monthlyExpected[monthIndex] || 0;
    setChartPopup({
      label: MONTH_NAMES[monthIndex],
      count: monthLessons.length,
      income: inc,
      students: studentNames,
    });
  };

  const handleDayBarClick = (dayIndex: number, dayStr: string) => {
    const dayLessons = lessons.filter(l => isUserLesson(l) && l.date === dayStr);
    const studentNames = Array.from(new Set(dayLessons.map(l => l.studentName))).filter(Boolean) as string[];
    const days = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
    setChartPopup({
      label: `${days[dayIndex]}, ${format(parseISO(dayStr), 'd MMM', { locale: ru })}`,
      count: dayLessons.length,
      income: 0,
      students: studentNames,
    });
  };

  if (!isInit) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-neon-purple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const currentMonth = new Date().getMonth();
  const totalProjected = incomeAmount + expectedRevenue;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="glass-medium px-4 pt-3 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Финансы</h1>
          <p className="text-[10px] text-white/40 mt-0.5">{periodLabel(period)}</p>
        </div>
        {/* Period switcher */}
        <div className="flex gap-1">
          {(['week', 'month', 'year'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
                period === p
                  ? 'bg-neon-purple/20 text-neon-purple border border-neon-purple/30'
                  : 'bg-white/5 text-white/40 hover:bg-white/10'
              }`}
            >
              {p === 'week' ? 'Нед' : p === 'month' ? 'Мес' : 'Год'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">

        {/* ── Hero Cards Row ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          {/* Income card */}
          <div className="glass rounded-2xl p-3 space-y-1.5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, #10b981, transparent)', transform: 'translate(20%, -20%)' }} />
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <Wallet className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <span className="text-[10px] text-white/50">Доход</span>
            </div>
            <p className="text-xl font-bold text-emerald-400 leading-none">
              {incomeAmount.toLocaleString()}
              <span className="text-xs font-normal ml-0.5 text-emerald-400/70">₽</span>
            </p>
            <p className="text-[9px] text-white/30">фактически получено</p>
          </div>

          {/* Expected card */}
          <div className="glass rounded-2xl p-3 space-y-1.5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 rounded-full opacity-10"
              style={{ background: 'radial-gradient(circle, #a855f7, transparent)', transform: 'translate(20%, -20%)' }} />
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-lg bg-neon-purple/20 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-neon-purple" />
              </div>
              <span className="text-[10px] text-white/50">Ожидается</span>
            </div>
            <p className="text-xl font-bold text-neon-purple leading-none">
              {expectedRevenue.toLocaleString()}
              <span className="text-xs font-normal ml-0.5 opacity-70">₽</span>
            </p>
            <p className="text-[9px] text-white/30">
              {period === 'year' ? 'до конца года' : period === 'month' ? 'до конца месяца' : 'за неделю'}
            </p>
          </div>
        </div>

        {/* ── Summary strip ──────────────────────────────────────────────── */}
        <div className="glass rounded-2xl px-4 py-3 flex items-center justify-between">
          <div className="text-center flex-1">
            <p className="text-[9px] text-white/40 mb-0.5">Итого</p>
            <p className="text-base font-bold">{totalProjected.toLocaleString()} ₽</p>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="text-center flex-1">
            <p className="text-[9px] text-white/40 mb-0.5">Не оплачено</p>
            <p className="text-base font-bold text-amber-400">{unpaidAmount.toLocaleString()} ₽</p>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="text-center flex-1">
            <p className="text-[9px] text-white/40 mb-0.5">Уроков</p>
            <p className="text-base font-bold text-neon-blue">
              {lessons.filter(l => isUserLesson(l) && l.date >= startStr && l.date <= endStr).length}
            </p>
          </div>
        </div>

        {/* ── Income progress vs expected ─────────────────────────────────── */}
        {totalProjected > 0 && (
          <div className="glass rounded-2xl px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[11px] font-medium">Выполнение плана</span>
              </div>
              <span className="text-[10px] text-white/40">
                {Math.round((incomeAmount / totalProjected) * 100)}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, (incomeAmount / totalProjected) * 100)}%`,
                  background: 'linear-gradient(90deg, #10b981, #34d399)',
                }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-white/30">
              <span>Получено: {incomeAmount.toLocaleString()} ₽</span>
              <span>Ожидается: {expectedRevenue.toLocaleString()} ₽</span>
            </div>
          </div>
        )}

        {/* ── Annual chart (year only) ─────────────────────────────────────── */}
        {period === 'year' && (
          <div className="glass rounded-2xl px-4 py-3 space-y-2">
            <div className="flex items-center gap-1.5 mb-1">
              <BarChart2 className="w-3.5 h-3.5 text-neon-blue" />
              <span className="text-[11px] font-medium">По месяцам</span>
              <span className="ml-auto text-[9px] text-white/30">нажми на столбик</span>
            </div>
            <div className="flex items-end gap-1" style={{ height: 60 }}>
              {Array(12).fill(0).map((_, i) => {
                const income = monthlyIncome[i] || 0;
                const expected = monthlyExpected[i] || 0;
                const maxVal = Math.max(...monthlyIncome, ...monthlyExpected, 1);
                const isPast = i < currentMonth;
                const isCurrent = i === currentMonth;
                const barVal = (isPast || isCurrent) ? income : expected;
                const barColor = isCurrent ? '#10b981'
                  : isPast ? 'rgba(16,185,129,0.55)'
                  : 'rgba(168,85,247,0.45)';
                return (
                  <button
                    key={i}
                    onClick={() => handleMonthBarClick(i)}
                    className="flex-1 flex flex-col items-center gap-0.5 group"
                  >
                    <div className="w-full flex items-end" style={{ height: 48 }}>
                      <div
                        className="w-full rounded-sm transition-opacity group-active:opacity-70"
                        style={{
                          height: `${Math.max(2, (barVal / maxVal) * 48)}px`,
                          background: barColor,
                        }}
                      />
                    </div>
                    <span className={`text-[7px] ${i === currentMonth ? 'text-emerald-400' : 'text-white/30'}`}>
                      {MONTH_NAMES[i]}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-emerald-500/60" />
                <span className="text-[9px] text-white/40">Получено</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-neon-purple/40" />
                <span className="text-[9px] text-white/40">Прогноз</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Weekly mini chart (week only) ─────────────────────────────────── */}
        {period === 'week' && (() => {
          const days = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
          const wStart = startOfWeek(new Date(), { weekStartsOn: 1 });
          const dayDates = days.map((_, i) => format(new Date(wStart.getTime() + i * 86400000), 'yyyy-MM-dd'));
          const dayCounts = dayDates.map(d => lessons.filter(l => isUserLesson(l) && l.date === d).length);
          const maxCount = Math.max(...dayCounts, 1);
          const today = format(new Date(), 'yyyy-MM-dd');
          return (
            <div className="glass rounded-2xl px-4 py-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-neon-blue" />
                <span className="text-[11px] font-medium">Уроки на неделе</span>
                <span className="ml-auto text-[9px] text-white/30">нажми на столбик</span>
              </div>
              <div className="flex items-end gap-1" style={{ height: 52 }}>
                {days.map((day, i) => {
                  const isToday = dayDates[i] === today;
                  return (
                    <button
                      key={i}
                      onClick={() => handleDayBarClick(i, dayDates[i])}
                      className="flex-1 flex flex-col items-center gap-0.5 group"
                    >
                      <div className="w-full flex items-end" style={{ height: 40 }}>
                        <div
                          className="w-full rounded-sm transition-opacity group-active:opacity-70"
                          style={{
                            height: `${Math.max(2, (dayCounts[i] / maxCount) * 40)}px`,
                            background: isToday ? '#3b82f6'
                              : dayCounts[i] > 0 ? 'rgba(59,130,246,0.5)'
                              : 'rgba(255,255,255,0.05)',
                          }}
                        />
                      </div>
                      <span className={`text-[7px] ${isToday ? 'text-neon-blue' : 'text-white/30'}`}>{day}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── Per-student breakdown ─────────────────────────────────────────── */}
        {studentBreakdown.length > 0 && (
          <div className="glass rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 flex items-center gap-1.5 border-b border-white/5">
              <User className="w-3.5 h-3.5 text-white/50" />
              <span className="text-[11px] font-medium">По ученикам</span>
              <span className="ml-auto text-[9px] text-white/30">{studentBreakdown.length} учеников</span>
            </div>
            {studentBreakdown.map((item, idx) => {
              const isExpanded = expandedStudent === item.id;
              const maxPaid = studentBreakdown[0]?.paid || 1;
              return (
                <div key={item.id}>
                  <button
                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/5 transition-colors"
                    onClick={() => setExpandedStudent(isExpanded ? null : item.id)}
                  >
                    {/* Avatar */}
                    <div className="w-7 h-7 rounded-full bg-neon-purple/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-neon-purple">
                        {item.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    {/* Name + bar */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-medium truncate pr-2">{item.name}</span>
                        <span className="text-[11px] font-bold text-emerald-400 flex-shrink-0">
                          {item.paid > 0 ? `${item.paid.toLocaleString()} ₽` : '—'}
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(item.paid / maxPaid) * 100}%`,
                            background: 'linear-gradient(90deg, #10b981, #34d399)',
                          }}
                        />
                      </div>
                    </div>
                    {isExpanded
                      ? <ChevronUp className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
                      : <ChevronDown className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
                    }
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-3 pt-0 bg-white/3">
                      <div className="flex gap-4 text-[10px] text-white/50">
                        <div>
                          <span className="text-white/30">Уроков: </span>
                          <span className="text-white/70">{item.lessons}</span>
                        </div>
                        {item.tariff && (
                          <>
                            <div>
                              <span className="text-white/30">Тариф: </span>
                              <span className="text-white/70">{item.tariff.name}</span>
                            </div>
                            <div>
                              <span className="text-white/30">Цена: </span>
                              <span className="text-white/70">{item.tariff.price.toLocaleString()} ₽</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  {idx < studentBreakdown.length - 1 && (
                    <div className="h-px bg-white/5 mx-4" />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {studentBreakdown.length === 0 && (
          <div className="glass rounded-2xl px-4 py-8 text-center">
            <Clock className="w-8 h-8 text-white/20 mx-auto mb-2" />
            <p className="text-sm text-white/40">Нет данных за выбранный период</p>
          </div>
        )}

        <div className="h-2" />
      </div>

      {/* ── Chart detail popup ─────────────────────────────────────────────── */}
      {chartPopup && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center modal-overlay"
          onClick={() => setChartPopup(null)}
        >
          <div
            className="w-full max-w-sm mx-4 mb-6 rounded-2xl bg-dark-800 border border-white/10 p-4 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">{chartPopup.label}</span>
              <button
                onClick={() => setChartPopup(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4 text-white/50" />
              </button>
            </div>
            {/* Stats */}
            <div className="flex gap-3">
              <div className="flex-1 bg-white/5 rounded-xl p-2.5 text-center">
                <p className="text-[9px] text-white/40 mb-0.5">Уроков</p>
                <p className="text-xl font-bold text-neon-blue">{chartPopup.count}</p>
              </div>
              {chartPopup.income > 0 && (
                <div className="flex-1 bg-white/5 rounded-xl p-2.5 text-center">
                  <p className="text-[9px] text-white/40 mb-0.5">Доход</p>
                  <p className="text-xl font-bold text-emerald-400">{chartPopup.income.toLocaleString()} ₽</p>
                </div>
              )}
            </div>
            {/* Student list */}
            {chartPopup.students.length > 0 ? (
              <div>
                <p className="text-[10px] text-white/40 mb-1.5">Ученики:</p>
                <div className="flex flex-wrap gap-1.5">
                  {chartPopup.students.map(name => (
                    <span
                      key={name}
                      className="px-2 py-0.5 rounded-full bg-neon-purple/15 text-neon-purple text-[10px]"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-white/30 text-center py-1">Нет уроков</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
