'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { format, addDays, startOfWeek, isSameDay, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Pencil, Eye, Undo2, Redo2, CalendarDays, CalendarCheck, Clock3, Copy, GripVertical } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useToastStore } from '@/store/toastStore';
import type { Lesson, Student } from '@/types';
import { isUserLesson } from '@/types';
import LessonModal from './LessonModal';
import DailyReportModal from './DailyReportModal';

// Error Boundary for modals
class ModalErrorBoundary extends React.Component<
  { children: React.ReactNode; onClose: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onClose: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(_error: Error) {
    this.props.onClose();
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

// Hours displayed based on working hours or default 10-22
const useHours = (workingHours: { enabled: boolean; startHour: number; endHour: number }) => {
  return useMemo(() => {
    if (workingHours.enabled) {
      const start = Math.floor(workingHours.startHour);
      // Include up to endHour so the end boundary label is visible
      // e.g. endHour=22.0 → hours 10..22 (slot 22:00 shown, 22:30 filtered by workEndMin)
      // e.g. endHour=21.5 → hours 10..21 (slot 21:00 and 21:30 shown)
      const end = Math.ceil(workingHours.endHour);
      const count = Math.max(1, end - start + 1);
      return Array.from({ length: count }, (_, i) => start + i);
    }
    // Default hours 10-22 inclusive (13 hours)
    return Array.from({ length: 13 }, (_, i) => i + 10);
  }, [workingHours]);
};
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const SLOT_HEIGHT = 60;

function lessonCardStyle(hex: string): React.CSSProperties {
  return {
    backgroundColor: hex,
    borderColor: hex + 'cc',
    color: '#000',
    boxShadow: `0 0 0 1px ${hex + 'cc'}`,
  };
}

export default function Schedule() {
  const [isZoomAnimating, setIsZoomAnimating] = useState(false);
  const [isPinching, setIsPinching] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; time: string } | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [dragLesson, setDragLesson] = useState<Lesson | null>(null);
  const dragLessonRef = useRef<Lesson | null>(null);
  const dragMovedRef = useRef(false);
  // Mode: 'view' | 'edit' | 'move'
  const [mode, setMode] = useState<'view' | 'edit' | 'move'>('view');
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const containerRef = useRef<HTMLDivElement>(null);
  const rightTimeRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const footerInnerRef = useRef<HTMLDivElement>(null);
  const didScrollRef = useRef(false);
  const touchStartDistance = useRef<number>(0);
  const touchStartScale = useRef<number>(1);
  // Focal point for pinch-to-zoom (center between two fingers, in content coordinates)
  const focalPointRef = useRef<{ x: number; y: number } | null>(null);
  // Focal point in viewport coordinates (clientX/Y)
  const focalViewportRef = useRef<{ x: number; y: number } | null>(null);
  // Scroll position at pinch start
  const scrollAtPinchStart = useRef<{ left: number; top: number }>({ left: 0, top: 0 });
  
  const {
    students,
    lessons,
    dailyReports,
    currentWeekStart,
    setCurrentWeekStart,
    getLessonsByDate,
    updateLesson,
    undo,
    redo,
    canUndo,
    canRedo,
    workingHours,
    isInitialized,
    scheduleScale: scale,
    setScheduleScale: setScale,
    lessonColors,
    addLesson,
    copyWeekToNext,
  } = useAppStore();

  const showToast = useToastStore((state) => state.showToast);

  const [showWeekCopyPanel, setShowWeekCopyPanel] = useState(false);
  const [copyWeekConfirm, setCopyWeekConfirm] = useState(false);

  const DAYS_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

  const weekSchedule = useMemo(() => {
    const schedule: { day: string; date: string; lessons: { time: string; studentName: string }[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(parseISO(currentWeekStart), i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayLessons = lessons.filter((l) => l.date === dateStr && isUserLesson(l));
      if (dayLessons.length > 0) {
        schedule.push({
          day: DAYS_FULL[i],
          date: dateStr,
          lessons: dayLessons.map((l) => ({
            time: l.time,
            studentName: l.studentName,
          })).sort((a, b) => a.time.localeCompare(b.time)),
        });
      }
    }
    return schedule;
  }, [lessons, currentWeekStart]);

  const handleCopyToClipboard = useCallback(async () => {
    if (weekSchedule.length === 0) {
      showToast('Нет занятий для копирования', 'error');
      return;
    }
    let text = `Расписание на неделю (${format(parseISO(currentWeekStart), 'd MMMM', { locale: ru })} - ${format(addDays(parseISO(currentWeekStart), 6), 'd MMMM', { locale: ru })}):\n\n`;
    weekSchedule.forEach((day) => {
      text += `${day.day} (${format(parseISO(day.date), 'd MMMM', { locale: ru })}):\n`;
      day.lessons.forEach((lesson) => { text += `  ${lesson.time} — ${lesson.studentName}\n`; });
      text += '\n';
    });
    try {
      if (typeof window !== 'undefined' && (window as { Capacitor?: unknown }).Capacitor) {
        const { Clipboard } = await import('@capacitor/clipboard');
        await Clipboard.write({ string: text });
      } else {
        await navigator.clipboard.writeText(text);
      }
      showToast('Расписание скопировано в буфер', 'success');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      try { document.execCommand('copy'); showToast('Расписание скопировано', 'success'); } catch { showToast('Не удалось скопировать', 'error'); }
      document.body.removeChild(textarea);
    }
  }, [weekSchedule, currentWeekStart, showToast]);

  const handleCopyWeekToNext = useCallback(async () => {
    const result = await copyWeekToNext();
    if (result === 0) {
      showToast('Нет уроков для копирования', 'error');
    } else if (result === -1) {
      showToast('На следующей неделе уже есть уроки', 'info');
    } else {
      showToast(`Скопировано ${result} уроков на следующую неделю`, 'success');
    }
    setCopyWeekConfirm(false);
    setShowWeekCopyPanel(false);
  }, [copyWeekToNext, showToast]);

  const HOURS = useHours(workingHours);

  // Reactive check for unreported lessons today/yesterday
  const [todayStr, setTodayStr] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const yesterdayStr = useMemo(() => format(addDays(new Date(), -1), 'yyyy-MM-dd'), [todayStr]);

  const hasUnreportedToday = useMemo(() => {
    const todayLessons = lessons.filter((l) => l.date === todayStr && isUserLesson(l));
    if (todayLessons.length === 0) return false;
    const reportedIds = new Set(dailyReports.filter((r) => r.date === todayStr).map((r) => r.lessonId));
    return todayLessons.some((l) => !reportedIds.has(l.id));
  }, [lessons, dailyReports, todayStr]);

  const hasUnreportedYesterday = useMemo(() => {
    const yLessons = lessons.filter((l) => l.date === yesterdayStr && isUserLesson(l));
    if (yLessons.length === 0) return false;
    const reportedIds = new Set(dailyReports.filter((r) => r.date === yesterdayStr).map((r) => r.lessonId));
    return yLessons.some((l) => !reportedIds.has(l.id));
  }, [lessons, dailyReports, yesterdayStr]);

  // Which date to open in report modal
  const [reportDate, setReportDate] = useState<string | null>(null);

  useEffect(() => {
    // Update current time every minute
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    // Update todayStr when app comes to foreground
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setTodayStr(format(new Date(), 'yyyy-MM-dd'));
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup drag refs on unmount
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      dragLessonRef.current = null;
      dragMovedRef.current = false;
    };
  }, []);

  // Sync footer position with inner overflow-x-auto calendar grid via translateX
  useEffect(() => {
    const onScroll = (e: Event) => {
      const src = e.target as HTMLElement;
      if (src.classList.contains('pinch-zoom-container') || src.classList.contains('overflow-x-auto')) {
        if (footerInnerRef.current) {
          footerInnerRef.current.style.transform = `translateX(-${src.scrollLeft}px) scale(${scale})`;
          footerInnerRef.current.style.transformOrigin = 'top left';
        }
      }
    };
    const container = containerRef.current;
    container?.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => container?.removeEventListener('scroll', onScroll, { capture: true });
  }, [scale]);

  const weekDates = useMemo(() => {
    const start = parseISO(currentWeekStart);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentWeekStart]);

  const handlePrevWeek = useCallback(() => {
    const newStart = addDays(parseISO(currentWeekStart), -7);
    setCurrentWeekStart(format(newStart, 'yyyy-MM-dd'));
  }, [currentWeekStart, setCurrentWeekStart]);

  const handleNextWeek = useCallback(() => {
    const newStart = addDays(parseISO(currentWeekStart), 7);
    setCurrentWeekStart(format(newStart, 'yyyy-MM-dd'));
  }, [currentWeekStart, setCurrentWeekStart]);

  // Pinch-to-zoom handlers with throttling
  const getDistance = (touches: React.TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Throttle ref to prevent excessive re-renders
  const zoomThrottleRef = useRef<number | null>(null);

  // Get center point between two touches
  const getFocalPoint = (touches: React.TouchList): { x: number; y: number } => {
    if (touches.length < 2) return { x: 0, y: 0 };
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      setIsPinching(true);
      touchStartDistance.current = getDistance(e.touches);
      touchStartScale.current = scale;
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const focal = getFocalPoint(e.touches);
        // Store scroll at pinch start
        scrollAtPinchStart.current = { left: container.scrollLeft, top: container.scrollTop };
        // Viewport position of focal point
        focalViewportRef.current = { x: focal.x - rect.left, y: focal.y - rect.top };
        // Content position of focal point (in unscaled coords)
        focalPointRef.current = {
          x: (container.scrollLeft + focal.x - rect.left) / scale,
          y: (container.scrollTop + focal.y - rect.top) / scale,
        };
      }
    }
  }, [scale]);

  const lastScaleRef = useRef(scale);
  useEffect(() => {
    // After scale changes, adjust scroll so focal point stays fixed
    const container = containerRef.current;
    const focal = focalPointRef.current;
    const focalViewport = focalViewportRef.current;
    if (!container || !focal || !focalViewport || !isPinching) return;
    // New scroll = focalPoint * newScale - focalViewport
    const newScrollLeft = focal.x * scale - focalViewport.x;
    const newScrollTop = focal.y * scale - focalViewport.y;
    container.scrollLeft = Math.max(0, newScrollLeft);
    container.scrollTop = Math.max(0, newScrollTop);
    lastScaleRef.current = scale;
  }, [scale, isPinching]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && isPinching) {
      const currentDistance = getDistance(e.touches);
      const ratio = currentDistance / touchStartDistance.current;
      const sensitiveRatio = 1 + (ratio - 1) * 1.5;
      const newScale = Math.min(Math.max(
        touchStartScale.current * sensitiveRatio,
        0.5
      ), 3);

      // Throttle zoom updates to max 60fps
      if (zoomThrottleRef.current === null) {
        zoomThrottleRef.current = requestAnimationFrame(() => {
          setScale(newScale);
          zoomThrottleRef.current = null;
        });
      }
    }
  }, [isPinching]);

  const handleTouchEnd = useCallback(() => {
    setIsPinching(false);
    focalPointRef.current = null;
    // Cancel any pending zoom update
    if (zoomThrottleRef.current !== null) {
      cancelAnimationFrame(zoomThrottleRef.current);
      zoomThrottleRef.current = null;
    }
  }, []);

  // Debounced zoom buttons
  const zoomDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const smoothZoom = useCallback((next: number) => {
    setIsZoomAnimating(true);
    setScale(next);
    if (zoomDebounceRef.current) {
      clearTimeout(zoomDebounceRef.current);
    }
    zoomDebounceRef.current = setTimeout(() => setIsZoomAnimating(false), 150);
  }, []);

  const handleZoomIn = useCallback(() => {
    smoothZoom(Math.min(scale + 0.1, 2));
  }, [scale, smoothZoom]);

  const handleZoomOut = useCallback(() => {
    smoothZoom(Math.max(scale - 0.1, 0.4));
  }, [scale, smoothZoom]);

  const handleGoToday = useCallback(() => {
    const todayWeekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    setCurrentWeekStart(todayWeekStart);
    // Scroll to current time
    const now = new Date();
    const startHour = workingHours.enabled ? workingHours.startHour : 10;
    const pxPerMin = (SLOT_HEIGHT / 2) / 30;
    const scrollTop = Math.max(0, ((now.getHours() - startHour) * 60 + now.getMinutes()) * pxPerMin - 120);
    setTimeout(() => {
      if (containerRef.current) containerRef.current.scrollTop = scrollTop * scale;
    }, 50);
  }, [setCurrentWeekStart, workingHours, scale]);

  const handleSlotClick = (date: string, time: string) => {
    if (mode === 'view' || isPinching) return;
    // Check ref — dragLessonRef is set before mouseUp clears state
    const active = dragLessonRef.current;
    if (active) {
      // Only allow dropping in move mode
      if (mode !== 'move') return;
      updateLesson(active.id, { date, time });
      showToast('Урок перенесен', 'success');
      dragLessonRef.current = null;
      dragMovedRef.current = false;
      setDragLesson(null);
      return;
    }
    // Only allow adding new lessons in edit mode
    if (mode === 'edit') {
      setSelectedSlot({ date, time });
    }
  };

  const handleLessonPointerDown = (e: React.PointerEvent, lesson: Lesson) => {
    // Only allow dragging in move mode
    if (mode !== 'move') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragMovedRef.current = false;
    dragLessonRef.current = lesson;
    setDragLesson(lesson);
  };

  const handleLessonPointerMove = (e: React.PointerEvent) => {
    if (!dragLessonRef.current) return;
    if (Math.abs(e.movementX) > 3 || Math.abs(e.movementY) > 3) {
      dragMovedRef.current = true;
    }
  };

  const handleLessonPointerUp = (e: React.PointerEvent) => {
    // Release capture; do NOT clear dragLessonRef here — slot onClick will do it
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleLessonClick = (lesson: Lesson) => {
    if (isPinching) return;
    // In view mode, do nothing (just viewing)
    if (mode === 'view') return;
    // In move mode, do nothing on click (only drag is allowed)
    if (mode === 'move') {
      dragLessonRef.current = null;
      setDragLesson(null);
      return;
    }
    // Only open modal when not dragging
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      dragLessonRef.current = null;
      setDragLesson(null);
      return;
    }
    if (!dragLessonRef.current) {
      setSelectedLesson(lesson);
    }
    dragLessonRef.current = null;
    setDragLesson(null);
  };

  const isDragging = !!dragLesson;

  const handleCloseDay = (date?: string) => {
    setReportDate(date ?? todayStr);
    setShowReportModal(true);
  };

  const [showFreeSlots, setShowFreeSlots] = useState(false);
  const [freeSlotsText, setFreeSlotsText] = useState('');

  const generateFreeSlots = useCallback(() => {
    const DAY_NAMES = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
    const today = new Date();
    let message = 'СВОБОДНЫЕ МЕСТА:\n\n';
    let hasAny = false;
    const workStartMin = workingHours.enabled ? Math.round(workingHours.startHour * 60) : 10 * 60;
    const workEndMin = workingHours.enabled ? Math.round(workingHours.endHour * 60) : 22 * 60;

    // Get fresh lessons from store to ensure up-to-date data
    const freshLessons = useAppStore.getState().lessons;

    for (let i = 0; i < 14; i++) {
      const checkDate = addDays(today, i);
      const dateStr = format(checkDate, 'yyyy-MM-dd');
      const dayLessons = freshLessons.filter((l) => l.date === dateStr).sort((a, b) => a.time.localeCompare(b.time));

      const intervals: { s: number; e: number }[] = [];
      for (let j = 0; j < dayLessons.length; j++) {
        const l = dayLessons[j];
        // Include breaks as occupied time so they don't appear in free slots
        const [h, m] = l.time.split(':').map(Number);
        const s = h * 60 + m;
        const e = s + (l.duration || 60);
        if (e > s) intervals.push({ s, e });
      }
      intervals.sort((a, b) => a.s - b.s || a.e - b.e);
      const merged: { s: number; e: number }[] = [];
      for (let j = 0; j < intervals.length; j++) {
        const cur = intervals[j];
        if (merged.length === 0 || cur.s > merged[merged.length - 1].e) {
          merged.push({ s: cur.s, e: cur.e });
        } else if (cur.e > merged[merged.length - 1].e) {
          merged[merged.length - 1].e = cur.e;
        }
      }

      const free: string[] = [];
      const step = 60;
      let prevEnd = workStartMin;
      for (let j = 0; j < merged.length; j++) {
        const iv = merged[j];
        while (prevEnd + step <= iv.s && prevEnd < workEndMin) {
          const h = Math.floor(prevEnd / 60);
          const mm = prevEnd % 60;
          free.push(`${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
          prevEnd += step;
        }
        prevEnd = Math.max(prevEnd, iv.e);
      }
      while (prevEnd < workEndMin) {
        const h = Math.floor(prevEnd / 60);
        const mm = prevEnd % 60;
        free.push(`${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
        prevEnd += step;
      }

      if (free.length > 0) {
        hasAny = true;
        const dayName = DAY_NAMES[checkDate.getDay()];
        const dayNum = format(checkDate, 'd');
        const monthName = format(checkDate, 'MMM', { locale: ru });
        message += `${dayName} ${dayNum} ${monthName}:\n${free.join(', ')}\n\n`;
      }
    }

    if (!hasAny) {
      showToast('Нет свободных окошек на ближайшие 14 дней', 'info');
      return;
    }
    setFreeSlotsText(message);
    setShowFreeSlots(true);
  }, [showToast, workingHours]);

  // Convert minutes since midnight to pixel position
  const minutesToPx = (minutes: number) => {
    const DAY_START = HOURS[0];
    const HALF = SLOT_HEIGHT / 2;
    return ((minutes - DAY_START * 60) / 30) * HALF;
  };

  // Get break blocks for a day - shows breaks in empty slots between lessons, but not after last lesson
  // Memoized to prevent recalculation on every render
  const getBreakBlocks = useCallback((dateStr: string) => {
    // All lessons except break-type to calculate occupied time ranges
    const allDay = getLessonsByDate(dateStr).filter((l) => l.lessonType !== 'break').sort((a, b) => {
      const [ah, am] = a.time.split(':').map(Number);
      const [bh, bm] = b.time.split(':').map(Number);
      return ah * 60 + am - (bh * 60 + bm);
    });

    // Only user lessons define the "frame" (first and last) — breaks shown between them
    const userLessons = allDay
      .filter(isUserLesson)
      .sort((a, b) => {
        const [ah, am] = a.time.split(':').map(Number);
        const [bh, bm] = b.time.split(':').map(Number);
        return ah * 60 + am - (bh * 60 + bm);
      });
    if (userLessons.length < 2) return []; // need at least 2 user lessons for a break between them

    // Build merged occupied intervals from ALL lessons
    type Interval = { start: number; end: number };
    const raw: Interval[] = allDay.map((l) => {
      const [h, m] = l.time.split(':').map(Number);
      const start = h * 60 + m;
      return { start, end: start + l.duration };
    });
    raw.sort((a, b) => a.start - b.start);
    const merged: Interval[] = [];
    for (const iv of raw) {
      if (merged.length && iv.start <= merged[merged.length - 1].end) {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, iv.end);
      } else {
        merged.push({ ...iv });
      }
    }

    // Frame: from end of first user lesson to start of last user lesson
    const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const frameStart = toMin(userLessons[0].time) + userLessons[0].duration; // end of first user lesson
    const frameEnd   = toMin(userLessons[userLessons.length - 1].time);       // start of last user lesson

    if (frameEnd <= frameStart) return []; // lessons back-to-back or overlapping

    const DAY_START_MIN = HOURS[0] * 60;
    const toPx = (min: number) => ((min - DAY_START_MIN) / 30) * (SLOT_HEIGHT / 2);
    const fmt  = (min: number) =>
      `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

    const breaks: { start: string; end: string; top: number; height: number }[] = [];

    // Find gaps inside the frame (clamp to frameStart..frameEnd)
    for (let i = 0; i < merged.length - 1; i++) {
      const rawGapStart = merged[i].end;
      const rawGapEnd   = merged[i + 1].start;

      const gapStart = Math.max(rawGapStart, frameStart);
      const gapEnd   = Math.min(rawGapEnd,   frameEnd);

      if (gapEnd <= gapStart) continue; // no actual gap in frame

      const top    = toPx(gapStart) + 2;
      const bottom = toPx(gapEnd)   + 2;
      const height = Math.max(24, bottom - top - 4);

      breaks.push({ start: fmt(gapStart), end: fmt(gapEnd), top, height });
    }

    return breaks;
  }, [getLessonsByDate, HOURS]);

  // Memoized student name lookup
  const getStudentName = useCallback((studentId: string, fallbackName?: string): { name: string; isFrozen: boolean } => {
    const student = students.find((s: Student) => s.id === studentId);
    return { name: student?.fullName || fallbackName || 'Неизвестно', isFrozen: student?.isFrozen || false };
  }, [students]);

  // Get report status for lesson
  const getReportEmoji = useCallback((lessonId: string, date: string): string => {
    const report = dailyReports.find((r) => r.lessonId === lessonId && r.date === date);
    if (!report) return '';
    switch (report.status) {
      case 'present': return '✓';
      case 'absent': return '✗';
      case 'rescheduled': return '→';
      case 'frozen': return '❄';
      default: return '';
    }
  }, [dailyReports]);

  // Get report overlay style for lesson card
  const getReportOverlay = useCallback((lessonId: string, date: string): { bg: string; text: string } | null => {
    const report = dailyReports.find((r) => r.lessonId === lessonId && r.date === date);
    if (!report) return null;
    switch (report.status) {
      case 'present':    return { bg: 'rgba(34,197,94,0.25)',  text: '#86efac' };  // green
      case 'absent':     return { bg: 'rgba(239,68,68,0.35)',  text: '#fca5a5' };  // red
      case 'rescheduled':return { bg: 'rgba(251,191,36,0.25)', text: '#fde68a' };  // amber
      case 'frozen':     return { bg: 'rgba(34,211,238,0.25)', text: '#67e8f9' };  // cyan
      default: return null;
    }
  }, [dailyReports]);

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-neon-purple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const weekRangeText = `${format(parseISO(currentWeekStart), 'd MMM', { locale: ru })} - ${format(addDays(parseISO(currentWeekStart), 6), 'd MMM yyyy', { locale: ru })}`;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="glass-medium px-4 pt-5 pb-3 shrink-0 z-20 relative space-y-2">
        {/* Row 1: Week navigation — centered */}
        <div className="flex items-center justify-center gap-3">
          <button onClick={handlePrevWeek} aria-label="Предыдущая неделя" className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold min-w-[160px] text-center">{weekRangeText}</span>
          <button onClick={handleNextWeek} aria-label="Следующая неделя" className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Row 2: Controls — centered */}
        <div className="flex items-center justify-center gap-2 flex-wrap">

          {/* Edit toggle: single button for view/edit */}
          <button
            onClick={() => {
              if (mode === 'move') setMode('edit');
              else setMode(mode === 'view' ? 'edit' : 'view');
            }}
            aria-label={mode === 'edit' ? "Режим просмотра" : "Режим редактирования"}
            className={`p-2 rounded-lg transition-colors ${
              mode === 'edit' ? 'bg-neon-purple text-white' : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            {mode === 'edit' ? <Eye className="w-5 h-5" /> : <Pencil className="w-5 h-5" />}
          </button>

          {/* Undo/Redo - only in edit mode */}
          {mode === 'edit' && (
            <>
              <button onClick={undo} disabled={!canUndo} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 transition-colors">
                <Undo2 className="w-5 h-5" />
              </button>
              <button onClick={redo} disabled={!canRedo} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 transition-colors">
                <Redo2 className="w-5 h-5" />
              </button>
            </>
          )}

          <div className="w-px h-6 bg-white/20 mx-0.5 shrink-0" />

          {/* Report button - only in view mode */}
          {mode === 'view' && (
            <button
              onClick={() => handleCloseDay(todayStr)}
              className={`relative px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                hasUnreportedToday ? 'bg-red-500 hover:bg-red-400 animate-pulse' : 'bg-neon-purple/80 hover:bg-neon-purple'
              }`}
            >
              Отчёт
              {hasUnreportedToday && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 items-center justify-center">
                    <span className="text-[8px] text-white font-bold">!</span>
                  </span>
                </span>
              )}
            </button>
          )}

          {/* Go to today */}
          <button
            onClick={handleGoToday}
            className="flex items-center gap-1 px-2.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-xs font-medium"
            title="Сегодня"
          >
            <CalendarCheck className="w-4 h-4" />
            Сегодня
          </button>

          {/* Free slots — only in view mode */}
          {mode === 'view' && (
            <button
              onClick={generateFreeSlots}
              className="flex items-center gap-1 px-2.5 py-2 rounded-lg bg-emerald-600/70 hover:bg-emerald-600 transition-colors text-xs font-medium"
              title="Расписание"
            >
              <CalendarDays className="w-4 h-4" />
              Расписание
            </button>
          )}

          {/* Copy week */}
          <button
            onClick={() => setShowWeekCopyPanel(!showWeekCopyPanel)}
            className={`flex items-center gap-1 px-2.5 py-2 rounded-lg transition-colors text-xs font-medium ${
              showWeekCopyPanel ? 'bg-neon-cyan/20 text-neon-cyan' : 'bg-white/10 hover:bg-white/20'
            }`}
            title="Копия недели"
          >
            <Copy className="w-4 h-4" />
            Копия
          </button>

          {/* Move mode button - toggle between edit and move */}
          {(mode === 'edit' || mode === 'move') && (
            <button
              onClick={() => setMode(mode === 'move' ? 'edit' : 'move')}
              className={`flex items-center gap-1 px-2.5 py-2 rounded-lg transition-colors text-xs font-medium ${
                mode === 'move' ? 'bg-amber-500 text-white' : 'bg-amber-500/20 hover:bg-amber-500 text-amber-400 hover:text-white'
              }`}
              title={mode === 'move' ? 'Завершить перенос' : 'Перенос уроков'}
            >
              <GripVertical className="w-4 h-4" />
              Перенос
            </button>
          )}
        </div>
      </div>

      {/* Copy week to next week modal */}
      {showWeekCopyPanel && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center modal-overlay">
          <div className="bg-dark-800 w-full max-w-sm mx-4 mb-4 sm:mb-0 rounded-2xl border border-white/10 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h2 className="text-base font-semibold">Копия недели</h2>
              <button onClick={() => { setShowWeekCopyPanel(false); setCopyWeekConfirm(false); }} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                <span className="text-white/60 text-lg leading-none">×</span>
              </button>
            </div>
            <div className="px-4 py-5 space-y-3">
              <p className="text-sm text-white/70">
                Скопировать все уроки текущей недели
                <span className="text-white font-medium"> ({format(parseISO(currentWeekStart), 'd MMM', { locale: ru })} — {format(addDays(parseISO(currentWeekStart), 6), 'd MMM', { locale: ru })})</span>
                {' '}на следующую неделю
                <span className="text-white font-medium"> ({format(addDays(parseISO(currentWeekStart), 7), 'd MMM', { locale: ru })} — {format(addDays(parseISO(currentWeekStart), 13), 'd MMM', { locale: ru })})</span>?
              </p>
              <p className="text-xs text-white/40">Уроки которые уже есть на следующей неделе в то же время — не будут дублироваться.</p>
              {!copyWeekConfirm ? (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setShowWeekCopyPanel(false); setCopyWeekConfirm(false); }}
                    className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm">
                    Отмена
                  </button>
                  <button onClick={() => setCopyWeekConfirm(true)}
                    className="flex-1 py-2.5 rounded-xl bg-neon-purple hover:bg-neon-purple/80 transition-colors text-sm font-medium">
                    Копировать
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setCopyWeekConfirm(false)}
                    className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm">
                    Назад
                  </button>
                  <button onClick={handleCopyWeekToNext}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 transition-colors text-sm font-medium">
                    Подтвердить
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Calendar Grid + Footer wrapper */}
      <div className="flex-1 flex flex-col min-h-0" style={{ overflow: 'hidden' }}>
      <div className="overflow-x-hidden overflow-y-auto" style={{ flex: '0 1 auto', minHeight: 0 }} ref={containerRef}>

      {/* Calendar Grid - scrollable content */}
      <div
        className="w-full overflow-x-auto pinch-zoom-container no-select relative"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={(e) => {
          // Cancel drag mode when clicking outside lessons (on empty area)
          if (mode === 'move' && dragLessonRef.current) {
            const target = e.target as HTMLElement;
            // If clicked on slot/empty area (not on lesson card)
            if (!target.closest('[data-lesson-card="true"]')) {
              dragLessonRef.current = null;
              setDragLesson(null);
              dragMovedRef.current = false;
            }
          }
        }}
      >
        <div 
          className="flex justify-start items-start" 
          style={{ 
            minWidth: 'max-content',
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            transition: isPinching ? 'none' : 'transform 0.1s ease-out',
          }}
        >

          {/* LEFT Time Column - scrolls with calendar */}
          <div className="flex-shrink-0 z-30 text-black bg-white flex flex-col" style={{ width: 56 }}>
            {/* Time header */}
            <div className="h-12 flex items-center justify-center border-b border-black/10 bg-white">
              <span className="text-xs font-bold">Время</span>
            </div>
            {HOURS.map((hour) => {
              const isCurrentHour = currentTime.getHours() === hour;
              const wEndMin2 = workingHours.enabled ? Math.round(workingHours.endHour * 60) : HOURS[HOURS.length - 1] * 60;
              const show30L = hour * 60 + 30 <= wEndMin2;
              const showHourL = hour * 60 <= wEndMin2;
              if (!showHourL) return null;
              return (
                <div key={hour} className="flex flex-col border-b-2 border-gray-300" style={{ height: show30L ? SLOT_HEIGHT : SLOT_HEIGHT / 2 }}>
                  <div className={`flex items-center justify-center text-xs font-semibold border-b border-gray-200 ${
                    isCurrentHour ? 'font-bold text-neon-purple bg-gray-100' : 'text-black bg-white'
                  }`} style={{ height: SLOT_HEIGHT / 2 }}>
                    {hour}:00
                  </div>
                  {show30L && (
                    <div className="flex items-center justify-center text-[10px] text-black/50 bg-white"
                      style={{ height: SLOT_HEIGHT / 2 }}>
                      {hour}:30
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Days columns - no scale */}
          <div className="flex">
            {/* Days Columns */}
            <div className="flex bg-dark-800/50 rounded-r-lg">
            {weekDates.map((date, dayIndex) => {
              const dateStr = format(date, 'yyyy-MM-dd');
              let dayLessons = getLessonsByDate(dateStr);
              const isToday = isSameDay(date, new Date());

              // Filter lessons by working hours if enabled
              if (workingHours.enabled) {
                dayLessons = dayLessons.filter((l) => {
                  const [h, m] = l.time.split(':').map(Number);
                  const lessonHour = h + m / 60;
                  return lessonHour >= workingHours.startHour && lessonHour <= workingHours.endHour;
                });
              }

              return (
                <div
                  key={dayIndex}
                  className={`w-[80px] flex-shrink-0 border-r border-white/5 ${
                    isToday ? 'bg-neon-purple/5' : ''
                  }`}
                >
                  {/* Day Header - sticky at top */}
                  <div
                    className={`h-12 flex flex-col items-center justify-center border-b border-white/10 ${
                      isToday ? 'bg-neon-purple/20' : 'glass-medium'
                    }`}
                  >
                    <span className="text-xs font-medium">{DAYS[dayIndex]}</span>
                    <span className={`text-[10px] ${isToday ? 'text-neon-purple' : 'text-white/60'}`}>
                      {format(date, 'd MMM', { locale: ru })}
                    </span>
                  </div>

                  {/* Time Slots grid + lessons overlay */}
                  {(() => {
                    const HALF = SLOT_HEIGHT / 2; // px per 30 min (no scale)
                    const DAY_START = HOURS[0];

                    // "HH:MM" → px from top
                    const timeToPx = (t: string) => {
                      const [h, m] = t.split(':').map(Number);
                      return ((h - DAY_START) * 60 + m) / 30 * HALF;
                    };
                    // "HH:MM" → minutes since midnight
                    const timeToMin = (t: string) => {
                      const [h, m] = t.split(':').map(Number);
                      return h * 60 + m;
                    };
                    const minToStr = (total: number) =>
                      `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;

                    // --- Column layout (like Google Calendar) ---
                    // Assign each lesson a column index so overlapping ones sit side by side
                    type LessonWithCol = Lesson & { col: number; totalCols: number };
                    const placed: LessonWithCol[] = [];

                    // Sort by start time
                    const sorted = [...dayLessons].sort(
                      (a, b) => timeToMin(a.time) - timeToMin(b.time)
                    );

                    // Groups of overlapping lessons
                    const groups: Lesson[][] = [];
                    for (const lesson of sorted) {
                      const lStart = timeToMin(lesson.time);
                      const lEnd = lStart + lesson.duration;
                      let added = false;
                      for (const group of groups) {
                        // Check if lesson overlaps with any in the group
                        const overlaps = group.some((g) => {
                          const gStart = timeToMin(g.time);
                          const gEnd = gStart + g.duration;
                          return lStart < gEnd && lEnd > gStart;
                        });
                        if (overlaps) {
                          group.push(lesson);
                          added = true;
                          break;
                        }
                      }
                      if (!added) groups.push([lesson]);
                    }

                    for (const group of groups) {
                      const colEnd: number[] = [];
                      const startIdx = placed.length;
                      for (const lesson of group) {
                        const lStart = timeToMin(lesson.time);
                        const lEnd   = lStart + lesson.duration;
                        let col = colEnd.findIndex((e) => e <= lStart);
                        if (col === -1) col = colEnd.length;
                        colEnd[col] = lEnd;
                        placed.push({ ...lesson, col, totalCols: 0 });
                      }
                      const numCols = colEnd.length;
                      for (let i = startIdx; i < placed.length; i++) {
                        placed[i].totalCols = numCols;
                      }
                    }

                    // Covered slots set (for click blocking)
                    // freeSlot lessons are NOT added — their slot stays clickable to add a replacement
                    const coveredSlots = new Set<string>();
                    dayLessons.forEach((l: Lesson) => {
                      if (l.isFreeSlot) return; // allow clicking on free slot time
                      const [lh, lm] = l.time.split(':').map(Number);
                      const steps = Math.ceil(l.duration / 30);
                      for (let s = 0; s < steps; s++) {
                        const totalMin = lh * 60 + lm + s * 30;
                        const mm = totalMin % 60;
                        coveredSlots.add(`${Math.floor(totalMin / 60)}:${mm === 0 ? '00' : '30'}`);
                      }
                    });

                    const workEndMin = workingHours.enabled
                      ? Math.round(workingHours.endHour * 60)
                      : HOURS[HOURS.length - 1] * 60;
                    const totalSlots = HOURS.reduce((acc, h) => {
                      if ((h + 1) * 60 <= workEndMin) return acc + 2; // full hour with :30
                      if (h * 60 <= workEndMin) return acc + 1;       // boundary :00 slot
                      return acc;
                    }, 0);
                    const totalHeight = totalSlots * HALF;

                    // Current time line position (only for today)
                    const nowMin = currentTime.getHours() * 60 + currentTime.getMinutes();
                    const DAY_START_MIN = HOURS[0] * 60;
                    const DAY_END_MIN = HOURS[HOURS.length - 1] * 60;
                    const showNowLine = isToday && nowMin >= DAY_START_MIN && nowMin < DAY_END_MIN;
                    const nowLineTop = minutesToPx(nowMin);

                    return (
                      <div className="relative" style={{ height: totalHeight }}>
                        {/* Grid lines + click targets with transparent time labels */}
                        {HOURS.map((hour) => (
                          <React.Fragment key={hour}>
                            {([`${hour}:00`, `${hour}:30`] as string[]).filter(slot => {
                              const [h, m] = slot.split(':').map(Number);
                              const slotMin = h * 60 + m;
                              // Always show :00 at exactly endHour as boundary; hide :30 at or past endHour
                              return m === 0 ? slotMin <= workEndMin : slotMin <= workEndMin;
                            }).map((slot) => (
                              <div
                                key={slot}
                                className={`absolute left-0 right-0 border-b border-white/5 flex items-center justify-center z-[5] ${
                                  isDragging && !coveredSlots.has(slot) ? 'bg-neon-purple/10' : ''
                                }`}
                                style={{ top: timeToPx(slot), height: HALF }}
                                onClick={() => {
                                  if (coveredSlots.has(slot) && !dragLessonRef.current) return;
                                  handleSlotClick(dateStr, slot);
                                }}
                              >
                                {/* Transparent time label - only show if slot is empty */}
                                {!coveredSlots.has(slot) && !isDragging && (
                                  <span className="text-[10px] text-white/10 font-light select-none pointer-events-none">
                                    {slot}
                                  </span>
                                )}
                              </div>
                            ))}
                          </React.Fragment>
                        ))}

                        {/* Current time line */}
                        {showNowLine && (
                          <div
                            className="absolute left-0 right-0 z-20 pointer-events-none"
                            style={{ top: nowLineTop }}
                          >
                            <div className="relative flex items-center">
                              <div className="w-2 h-2 rounded-full shrink-0 -ml-1" style={{ background: 'rgb(var(--accent))' }} />
                              <div className="flex-1 h-[1.5px]" style={{ background: 'rgb(var(--accent))' }} />
                            </div>
                          </div>
                        )}

                        {/* Auto break blocks removed — only manually added break lessons are shown */}

                        {/* Lessons with column layout */}
                        {placed.map((lesson) => {
                          const isBreak  = lesson.lessonType === 'break' || lesson.lessonType === 'business';
                          const isFreeSlot = lesson.isFreeSlot === true;
                          const isDraggingThis = dragLesson?.id === lesson.id;

                          const top    = timeToPx(lesson.time) + 2;
                          const height = (lesson.duration / 30) * HALF - 4;

                          const totalCols = lesson.totalCols || 1;
                          const colW = 100 / totalCols;
                          const hasReplacement = isFreeSlot && !!lesson.freeSlotReplacementId;
                          // Full column width always; split is vertical (top/bottom halves)
                          const widthPercent = colW;
                          const leftOffset = 0;
                          const left  = `calc(${lesson.col * colW + leftOffset}% + 2px)`;
                          const width = `calc(${widthPercent}% - 4px)`;

                          const endMin = timeToMin(lesson.time) + lesson.duration;
                          const replacement = lesson.freeSlotReplacementId ? students.find(s => s.id === lesson.freeSlotReplacementId) : null;

                          if (hasReplacement && replacement) {
                            const studentInfo = getStudentName(lesson.studentId, lesson.studentName);
                            const reportEmoji = getReportEmoji(lesson.id, lesson.date);
                            const reportOverlay = getReportOverlay(lesson.id, lesson.date);
                            // Determine replacement student's lesson type color
                            const replacementLesson = lessons.find(l => l.studentId === replacement.id && l.lessonType !== 'break' && l.lessonType !== 'business');
                            const replacementLessonType = replacementLesson?.lessonType || (replacement.isRecurring ? 'regular' : 'one_time');
                            const replacementColor = lessonColors[replacementLessonType] || '#facc15';
                            const replacementStyle = lessonCardStyle(replacementColor);
                            return (
                              <div
                                key={lesson.id}
                                data-lesson-card="true"
                                onClick={() => handleLessonClick(lesson)}
                                onPointerDown={(e) => handleLessonPointerDown(e, lesson)}
                                onPointerMove={handleLessonPointerMove}
                                onPointerUp={handleLessonPointerUp}
                                className={`absolute z-10 select-none rounded border overflow-hidden ${
                                  mode === 'move' ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                                } ${isDraggingThis ? 'opacity-50 ring-2 ring-white scale-95' : ''} ${isDragging && !isDraggingThis ? 'opacity-60 pointer-events-none' : ''}`}
                                style={{ top, height, left, width, borderColor: '#eab308', boxShadow: '0 0 0 1px #eab308' }}
                              >
                                {reportOverlay && (
                                  <div className="absolute inset-0 z-20 pointer-events-none flex items-start justify-end p-0.5">
                                    <span className="text-[9px] font-black leading-none" style={{ color: reportOverlay.text }}>{reportEmoji}</span>
                                  </div>
                                )}
                                {/* Top 50% — original student (yellow) */}
                                <div className="flex flex-col items-center justify-center" style={{ height: '50%', backgroundColor: '#facc15', color: '#000' }}>
                                  <span className="w-full text-center leading-tight px-0.5">
                                    <span className="block text-[9px] truncate font-bold">
                                      {studentInfo.name}
                                    </span>
                                    {lesson.duration > 30 && (
                                      <span className="block text-[8px] opacity-70">
                                        {lesson.time}–{minToStr(endMin)}
                                      </span>
                                    )}
                                  </span>
                                </div>
                                {/* Bottom 50% — replacement student (their lesson type color) */}
                                <div className="flex flex-col items-center justify-center" style={{ height: '50%', backgroundColor: replacementStyle.backgroundColor, color: replacementStyle.color }}>
                                  <span className="w-full text-center leading-tight px-0.5">
                                    <span className="block text-[9px] truncate font-bold">
                                      {replacement.fullName}
                                    </span>
                                    <span className="block text-[8px] opacity-70">замена</span>
                                  </span>
                                </div>
                              </div>
                            );
                          }

                          const reportOverlayCard = !isBreak ? getReportOverlay(lesson.id, lesson.date) : null;
                          const reportEmojiCard = !isBreak ? getReportEmoji(lesson.id, lesson.date) : '';
                          return (
                            <React.Fragment key={lesson.id}>
                            <div
                              data-lesson-card="true"
                              onClick={() => handleLessonClick(lesson)}
                              onPointerDown={(e) => handleLessonPointerDown(e, lesson)}
                              onPointerMove={handleLessonPointerMove}
                              onPointerUp={handleLessonPointerUp}
                              className={`absolute z-10 select-none flex flex-col items-center justify-start pt-0.5 rounded border overflow-hidden ${
                                mode === 'move' ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                              } ${isDraggingThis ? 'opacity-50 ring-2 ring-white scale-95' : ''} ${isDragging && !isDraggingThis ? 'opacity-60 pointer-events-none' : ''}`}
                              style={{ top, height, left, width, ...(isFreeSlot ? { backgroundColor: '#facc15', borderColor: '#eab308', color: '#000', boxShadow: '0 0 0 1px #eab308' } : lessonCardStyle(lessonColors[lesson.lessonType] || '#facc15')) }}
                            >
                              {reportOverlayCard && (
                                <div className="absolute inset-0 z-20 pointer-events-none flex items-start justify-end p-0.5">
                                  <span className="text-[9px] font-black leading-none" style={{ color: reportOverlayCard.text }}>{reportEmojiCard}</span>
                                </div>
                              )}
                              {(isBreak || lesson.lessonType === 'business') ? (
                                <span
                                  className={`font-bold w-full text-center px-0.5 break-words leading-tight ${
                                    (lesson.lessonType === 'business' && lesson.notes ? lesson.notes : lesson.studentName).length > 30
                                      ? 'text-[8px]'
                                      : (lesson.lessonType === 'business' && lesson.notes ? lesson.notes : lesson.studentName).length > 15
                                        ? 'text-[9px]'
                                        : 'text-[10px]'
                                  }`}
                                  style={{
                                    display: '-webkit-box',
                                    WebkitLineClamp: lesson.duration >= 60 ? 3 : (lesson.duration >= 45 ? 2 : 1),
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                  }}
                                >
                                  {lesson.lessonType === 'business' && lesson.notes ? lesson.notes : lesson.studentName}
                                </span>
                              ) : (
                                <span className={`w-full text-center leading-tight px-0.5 relative ${isFreeSlot ? 'opacity-60' : ''}`}>
                                  {isFreeSlot && !getStudentName(lesson.studentId, lesson.studentName).isFrozen && (
                                    <span className="absolute top-0 right-0.5 leading-none flex items-center gap-0.5" title="Временно свободно">
                                      <span className="text-[8px]">✅</span>
                                      <Clock3 className="w-2.5 h-2.5 opacity-80" />
                                    </span>
                                  )}
                                  {(() => {
                                    const studentInfo = getStudentName(lesson.studentId, lesson.studentName);
                                    if (studentInfo.isFrozen) {
                                      return (
                                        <span className="block text-[10px] truncate font-bold" title={studentInfo.name}>
                                          ❄️ {studentInfo.name}
                                        </span>
                                      );
                                    }
                                    return (
                                      <>
                                        <span className="block text-[10px] truncate font-bold" title={studentInfo.name}>
                                          {studentInfo.name}
                                        </span>
                                      </>
                                    );
                                  })()}
                                  {lesson.duration > 30 && (
                                    <span className="block text-[9px] opacity-70 truncate">
                                      {lesson.time}–{minToStr(endMin)}
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    );
                  })()}

                </div>
              );
            })}
          </div>

          </div>{/* end days */}

          {/* RIGHT Time Column - scrolls with calendar */}
          <div className="flex-shrink-0 z-30 text-black bg-white flex flex-col" style={{ width: 56 }}>
            {/* Time header */}
            <div className="h-12 flex items-center justify-center border-b border-black/10 bg-white">
              <span className="text-xs font-bold">Время</span>
            </div>
            {HOURS.map((hour) => {
              const isCurrentHour = currentTime.getHours() === hour;
              const wEndMin3 = workingHours.enabled ? Math.round(workingHours.endHour * 60) : HOURS[HOURS.length - 1] * 60;
              const show30R = hour * 60 + 30 <= wEndMin3;
              const showHourR = hour * 60 <= wEndMin3;
              if (!showHourR) return null;
              return (
                <div key={hour} className="flex flex-col border-b-2 border-gray-300" style={{ height: show30R ? SLOT_HEIGHT : SLOT_HEIGHT / 2 }}>
                  <div className={`flex items-center justify-center text-xs font-semibold border-b border-gray-200 ${
                    isCurrentHour ? 'font-bold text-neon-purple bg-gray-100' : 'text-black bg-white'
                  }`} style={{ height: SLOT_HEIGHT / 2 }}>
                    {hour}:00
                  </div>
                  {show30R && (
                    <div className="flex items-center justify-center text-[10px] text-black/50 bg-white"
                      style={{ height: SLOT_HEIGHT / 2 }}>
                      {hour}:30
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>{/* end flex */}
      </div>{/* end calendar grid */}

      </div>{/* end scroll container */}

      {/* Footer with day names - fixed outside scroll, synced horizontally */}
      <div
        ref={footerRef}
        className="shrink-0 overflow-hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        <div
          ref={footerInnerRef}
          className="flex items-stretch"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            width: `${100 / scale}%`,
          }}
        >
          <div className="flex-shrink-0 bg-white flex items-center justify-center" style={{ width: 56, height: 40 }}>
            <span className="text-xs font-bold text-black">Время</span>
          </div>
          <div className="flex">
            {weekDates.map((date, dayIndex) => {
              const isToday = isSameDay(date, new Date());
              return (
                <div key={dayIndex}
                  className={`w-[80px] flex-shrink-0 h-10 flex flex-col items-center justify-center border-r border-white/5 ${
                    isToday ? 'bg-neon-purple/20' : 'glass-medium'
                  }`}
                >
                  <span className="text-xs font-medium">{DAYS[dayIndex]}</span>
                  <span className={`text-[10px] ${isToday ? 'text-neon-purple' : 'text-white/60'}`}>
                    {format(date, 'd MMM', { locale: ru })}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex-shrink-0 bg-white flex items-center justify-center" style={{ width: 56, height: 40 }}>
            <span className="text-xs font-bold text-black">Время</span>
          </div>
        </div>
      </div>

      </div>{/* end calendar + footer wrapper */}

      {/* Joystick for Move Mode - floating at bottom */}
      {mode === 'move' && dragLesson && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
          {/* Up arrow - moves lesson UP in schedule (earlier time) */}
          <button
            onClick={() => {
              const lesson = dragLesson;
              if (!lesson) return;
              const [h, m] = lesson.time.split(':').map(Number);
              const currentMin = h * 60 + m;
              const newMin = currentMin - 30;
              if (newMin >= (HOURS[0] || 10) * 60) {
                const newH = Math.floor(newMin / 60);
                const newM = newMin % 60;
                const newTime = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
                updateLesson(lesson.id, { time: newTime });
                setDragLesson({ ...lesson, time: newTime });
              }
            }}
            className="w-12 h-12 rounded-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 shadow-xl flex items-center justify-center text-white transition-transform active:scale-95"
            aria-label="Вверх"
          >
            <ChevronLeft className="w-6 h-6 rotate-90" />
          </button>
          
          {/* Left/Right row */}
          <div className="flex items-center gap-4">
            {/* Left arrow - previous day */}
            <button
              onClick={() => {
                const lesson = dragLesson;
                if (!lesson) return;
                const currentDate = parseISO(lesson.date);
                const newDate = addDays(currentDate, -1);
                const newDateStr = format(newDate, 'yyyy-MM-dd');
                updateLesson(lesson.id, { date: newDateStr });
                setDragLesson({ ...lesson, date: newDateStr });
              }}
              className="w-12 h-12 rounded-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 shadow-xl flex items-center justify-center text-white transition-transform active:scale-95"
              aria-label="Влево"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            
            {/* Center - confirm/done */}
            <button
              onClick={() => {
                dragLessonRef.current = null;
                setDragLesson(null);
                dragMovedRef.current = false;
                setMode('edit');
                showToast('Перенос завершён', 'success');
              }}
              className="w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 shadow-xl flex items-center justify-center text-white transition-transform active:scale-95"
              aria-label="Завершить"
            >
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </button>
            
            {/* Right arrow - next day */}
            <button
              onClick={() => {
                const lesson = dragLesson;
                if (!lesson) return;
                const currentDate = parseISO(lesson.date);
                const newDate = addDays(currentDate, 1);
                const newDateStr = format(newDate, 'yyyy-MM-dd');
                updateLesson(lesson.id, { date: newDateStr });
                setDragLesson({ ...lesson, date: newDateStr });
              }}
              className="w-12 h-12 rounded-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 shadow-xl flex items-center justify-center text-white transition-transform active:scale-95"
              aria-label="Вправо"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
          
          {/* Down arrow - moves lesson DOWN in schedule (later time) */}
          <button
            onClick={() => {
              const lesson = dragLesson;
              if (!lesson) return;
              const [h, m] = lesson.time.split(':').map(Number);
              const currentMin = h * 60 + m;
              const newMin = currentMin + 30;
              const workEndMin = workingHours.enabled ? Math.round(workingHours.endHour * 60) : (HOURS[HOURS.length - 1] || 22) * 60;
              if (newMin <= workEndMin) {
                const newH = Math.floor(newMin / 60);
                const newM = newMin % 60;
                const newTime = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
                updateLesson(lesson.id, { time: newTime });
                setDragLesson({ ...lesson, time: newTime });
              }
            }}
            className="w-12 h-12 rounded-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 shadow-xl flex items-center justify-center text-white transition-transform active:scale-95"
            aria-label="Вниз"
          >
            <ChevronLeft className="w-6 h-6 -rotate-90" />
          </button>
        </div>
      )}

      {/* Modals with Error Boundary */}
      {selectedSlot && (
        <ModalErrorBoundary onClose={() => setSelectedSlot(null)}>
          <LessonModal
            date={selectedSlot.date}
            time={selectedSlot.time}
            onClose={() => setSelectedSlot(null)}
          />
        </ModalErrorBoundary>
      )}

      {selectedLesson && (
        <ModalErrorBoundary onClose={() => setSelectedLesson(null)}>
          <LessonModal
            lesson={selectedLesson}
            onClose={() => setSelectedLesson(null)}
          />
        </ModalErrorBoundary>
      )}

      {/* Yesterday unreported banner */}
      {hasUnreportedYesterday && !showReportModal && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-500/90 text-black text-xs font-semibold shadow-xl backdrop-blur-sm">
          <span>⚠️ Вчера не сдан отчёт</span>
          <button
            onClick={() => handleCloseDay(yesterdayStr)}
            className="px-2.5 py-1 rounded-lg bg-black/20 hover:bg-black/30 transition-colors text-[11px] font-bold"
          >
            Сдать
          </button>
        </div>
      )}

      {showReportModal && (
        <ModalErrorBoundary onClose={() => setShowReportModal(false)}>
          <DailyReportModal
            date={reportDate ?? todayStr}
            onClose={() => setShowReportModal(false)}
          />
        </ModalErrorBoundary>
      )}

      {/* Free Slots Preview Modal */}
      {showFreeSlots && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center modal-overlay">
          <div className="bg-dark-800 w-full max-w-sm mx-4 mb-4 sm:mb-0 rounded-2xl border border-white/10 overflow-hidden flex flex-col max-h-[70vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h2 className="text-base font-semibold tracking-wide">СВОБОДНЫЕ МЕСТА</h2>
              <button onClick={() => setShowFreeSlots(false)} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                <span className="text-white/60 text-lg leading-none">×</span>
              </button>
            </div>
            <pre className="flex-1 overflow-y-auto px-4 py-3 text-sm text-white/80 whitespace-pre-wrap font-sans">{freeSlotsText}</pre>
            <div className="border-t border-white/10 px-4 py-3 flex gap-2">
              <button onClick={() => setShowFreeSlots(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm">
                Закрыть
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(freeSlotsText).then(() => {
                    showToast('Скопировано!', 'success');
                    setShowFreeSlots(false);
                  });
                }}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 transition-colors text-sm font-medium">
                Копировать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
