'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { format, addDays, isToday, isThisWeek, isThisMonth } from 'date-fns';
import { Plus, Search, Trash2, GraduationCap, X, Snowflake, ChevronDown, UserCheck, Check, MoreHorizontal, Archive, RotateCcw, Copy, LogOut, CalendarDays } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useToastStore } from '@/store/toastStore';
import StudentModal from './StudentModal';
import LearningHistory from './LearningHistory';
import SwipeTabs from './SwipeTabs';
import type { Student, StudentStatus, Lesson, Tariff } from '@/types';
import { isUserLesson, SYSTEM_STUDENT_NAMES } from '@/types';
import { DEFAULT_EMOJIS } from '@/lib/defaultEmojis';

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

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// Default built-in filter IDs
const DEFAULT_FILTER_IDS = [
  'regular', 'evening', 'any_time', 'frozen', 'reserve'
] as const;

// Smart filter IDs (auto-generated, not manually selectable)
const SMART_FILTER_IDS = [] as const;

// Filter definition type
interface FilterDef {
  id: string;
  label: string;
  builtin: boolean;
}

// Export for use in other components
export { DEFAULT_FILTER_IDS, SMART_FILTER_IDS };
export type { FilterDef };

export default function Students() {
  const {
    students,
    archivedStudents,
    tariffs,
    lessons,
    dailyReports,
    addStudent,
    updateStudent,
    deleteStudent,
    getLessonsByDate,
    recordPayment,
    customStudentFilters,
    addCustomStudentFilter,
    removeCustomStudentFilter,
    workingHours,
    studentsScale,
    setStudentsScale,
  } = useAppStore();

  const { showToast } = useToastStore();

  const [showModal, setShowModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>(() => {
    try { return sessionStorage.getItem('students_activeFilter') || 'regular'; } catch { return 'regular'; }
  });
  const [showTariffModal, setShowTariffModal] = useState(false);
  const [showLearningHistory, setShowLearningHistory] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Persist active filter across tab switches
  useEffect(() => {
    try { sessionStorage.setItem('students_activeFilter', activeFilter); } catch {}
  }, [activeFilter]);

  // Save scroll position when user scrolls
  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const handleScroll = () => {
      scrollPositionsRef.current[activeFilter] = el.scrollTop;
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [activeFilter]);

  // Restore scroll position when filter changes
  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const saved = scrollPositionsRef.current[activeFilter];
    if (saved !== undefined) {
      requestAnimationFrame(() => {
        el.scrollTop = saved;
      });
    }
  }, [activeFilter]);

  // Restore scroll of active SwipeTabs container after every render (prevents jump on state changes)
  useLayoutEffect(() => {
    const el = tableContainerRefs.current.get(activeFilter);
    if (!el) return;
    const saved = scrollPositionsRef.current[activeFilter];
    if (saved !== undefined && el.scrollTop !== saved) {
      el.scrollTop = saved;
    }
  });

  // Filter management state
  const [filterMenuId, setFilterMenuId] = useState<string | null>(null);
  const [filterMenuPos, setFilterMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [editingFilterId, setEditingFilterId] = useState<string | null>(null);
  const [editingFilterLabel, setEditingFilterLabel] = useState('');
  const [isNewFilter, setIsNewFilter] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerPos, setEmojiPickerPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableContainerRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const filterTabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const filterIndicatorRef = useRef<HTMLDivElement>(null);
  const filterBarRef = useRef<HTMLDivElement>(null);
  const swipeTouchStartX = useRef(0);
  const swipeTouchStartY = useRef(0);
  const swipeIsDragging = useRef(false);
  const allFiltersRef = useRef<{ id: string; label: string; builtin: boolean }[]>([]);
  // Store scroll positions per filter to restore when returning to a filter
  const scrollPositionsRef = useRef<Record<string, number>>({});
  const isPinchingRef = useRef(false);
  const touchStartDistance = useRef<number>(0);
  const touchStartScale = useRef<number>(0.6);
  const zoomThrottleRef = useRef<number | null>(null);
  // Double-swipe logic: first swipe to edge, second swipe to switch tab
  const edgeSwipeReadyRef = useRef<'left' | 'right' | null>(null);
  const edgeSwipeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const getDistance = (touches: React.TouchList): number => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTableTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      isPinchingRef.current = true;
      touchStartDistance.current = getDistance(e.touches);
      touchStartScale.current = studentsScale;
    } else if (e.touches.length === 1) {
      swipeTouchStartX.current = e.touches[0].clientX;
      swipeTouchStartY.current = e.touches[0].clientY;
      swipeIsDragging.current = false;
    }
  }, [studentsScale]);

  const handleTableTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && isPinchingRef.current) {
      e.preventDefault();
      const ratio = getDistance(e.touches) / touchStartDistance.current;
      const sensitiveRatio = 1 + (ratio - 1) * 2.0;
      const next = Math.min(2.0, Math.max(0.4, touchStartScale.current * sensitiveRatio));
      if (zoomThrottleRef.current === null) {
        zoomThrottleRef.current = requestAnimationFrame(() => {
          setStudentsScale(next);
          zoomThrottleRef.current = null;
        });
      }
    } else if (e.touches.length === 1 && !isPinchingRef.current) {
      const dx = e.touches[0].clientX - swipeTouchStartX.current;
      const dy = e.touches[0].clientY - swipeTouchStartY.current;
      if (!swipeIsDragging.current && Math.abs(dx) > Math.abs(dy) * 1.2 && Math.abs(dx) > 8) {
        swipeIsDragging.current = true;
      }
    }
  }, [setStudentsScale]);

  const handleTableTouchEnd = useCallback(() => {
    isPinchingRef.current = false;
    if (zoomThrottleRef.current !== null) {
      cancelAnimationFrame(zoomThrottleRef.current);
      zoomThrottleRef.current = null;
    }
  }, []);

  const commonEmojis = (() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('custom_emoji_set') : null;
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        if (parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_EMOJIS;
  })();

  // Built-in filter labels (customizable by user)
  const [builtinLabels, setBuiltinLabels] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem('student_filter_labels');
        if (saved) return JSON.parse(saved);
      }
    } catch {}
    return {
      regular: 'Постоянные',
      evening: 'Только вечер',
      any_time: 'Любое время',
      frozen: 'Замороженные',
      reserve: 'Резерв',
    };
  });

  // Smart filters (auto-generated based on lesson times)
  const [enabledSmartFilters, setEnabledSmartFilters] = useState<string[]>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem('smart_filters_enabled');
        if (saved) return JSON.parse(saved);
      }
    } catch {}
    return [];
  });

  // Filter order (drag to reorder)
  const VALID_FILTER_IDS = ['regular', 'evening', 'any_time', 'frozen', 'reserve'];
  const CANONICAL_ORDER = ['regular', 'evening', 'any_time', 'frozen', 'reserve'];
  const [filterOrder, setFilterOrder] = useState<string[]>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem('student_filter_order');
        if (saved) {
          const parsed: string[] = JSON.parse(saved);
          // If saved order has any IDs not in VALID_FILTER_IDS — it's stale, reset
          const hasStale = parsed.some(id => !VALID_FILTER_IDS.includes(id));
          if (hasStale) {
            localStorage.setItem('student_filter_order', JSON.stringify(CANONICAL_ORDER));
            localStorage.removeItem('student_filter_labels');
            return CANONICAL_ORDER;
          }
          const filtered = parsed.filter(id => VALID_FILTER_IDS.includes(id));
          VALID_FILTER_IDS.forEach(id => { if (!filtered.includes(id)) filtered.push(id); });
          return filtered;
        }
      }
    } catch {}
    return CANONICAL_ORDER;
  });

  // Period sort button
  const [activePeriod, setActivePeriod] = useState<'yesterday' | 'today' | 'tomorrow' | 'week' | 'month' | null>(null);
  const [showPeriodMenu, setShowPeriodMenu] = useState(false);
  const [periodMenuPos, setPeriodMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const periodMenuRef = useRef<HTMLDivElement>(null);

  // Save filter labels to localStorage
  useEffect(() => {
    try { 
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('student_filter_labels', JSON.stringify(builtinLabels)); 
      }
    } catch {}
  }, [builtinLabels]);

  // Save smart filters to localStorage
  useEffect(() => {
    try { 
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('smart_filters_enabled', JSON.stringify(enabledSmartFilters)); 
      }
    } catch {}
  }, [enabledSmartFilters]);

  // Save filter order to localStorage (skip temp entries)
  useEffect(() => {
    try { 
      if (typeof window !== 'undefined' && window.localStorage) {
        const toSave = filterOrder.filter(id => !id.startsWith('__new__:'));
        localStorage.setItem('student_filter_order', JSON.stringify(toSave)); 
      }
    } catch {}
  }, [filterOrder]);

  // Filter type constants
  const regularFilterTypes = ['regular', 'evening', 'any_time', 'frozen', 'reserve'] as const;
  // All filters (built-in + custom + pending new) - ordered by filterOrder
  const allFilters = useMemo((): FilterDef[] => {
    // Build map of all available filters
    const builtinMap: Record<string, FilterDef> = {};
    const customMap: Record<string, FilterDef> = {};
    
    // Built-in filters from filterOrder
    filterOrder.forEach(id => {
      if (regularFilterTypes.includes(id as typeof regularFilterTypes[number])) {
        builtinMap[id] = { id, label: (builtinLabels as Record<string, string>)[id] || id, builtin: true };
      }
    });
    
    // Custom filters
    customStudentFilters.forEach((f) => {
      customMap[`custom:${f}`] = { id: `custom:${f}`, label: f, builtin: false };
    });
    
    // Combine in filterOrder sequence
    const result: FilterDef[] = [];
    filterOrder.forEach(id => {
      if (builtinMap[id]) {
        result.push(builtinMap[id]);
      } else if (customMap[id]) {
        result.push(customMap[id]);
      }
    });
    
    // Add any filters not in filterOrder (fallback - should not happen normally)
    Object.values(builtinMap).forEach(f => {
      if (!result.find(r => r.id === f.id)) result.push(f);
    });
    Object.values(customMap).forEach(f => {
      if (!result.find(r => r.id === f.id)) result.push(f);
    });
    
    // Append pending new filter entry so the inline input renders
    if (isNewFilter && editingFilterId) {
      result.push({ id: editingFilterId, label: editingFilterLabel, builtin: false });
    }
    return result;
  }, [customStudentFilters, builtinLabels, filterOrder, regularFilterTypes, isNewFilter, editingFilterId, editingFilterLabel]);

  // Keep ref in sync with latest allFilters for use in touch handlers
  allFiltersRef.current = allFilters;

  const filterPrevActiveRef = useRef<string | null>(null);

  // Animate sliding indicator under active filter tab
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      const activeIdx = allFilters.findIndex(f => f.id === activeFilter);
      const btn = filterTabRefs.current[activeIdx];
      const indicator = filterIndicatorRef.current;
      if (!btn || !indicator) return;
      const isFirst = filterPrevActiveRef.current === null;
      filterPrevActiveRef.current = activeFilter;
      indicator.style.transition = isFirst
        ? 'none'
        : 'left 0.28s cubic-bezier(0.4,0,0.2,1), width 0.28s cubic-bezier(0.4,0,0.2,1)';
      // btn has positioned ancestors (relative divs), so offsetLeft = 0.
      // Use getBoundingClientRect delta + scrollLeft for correct position inside scroll container.
      const bar = filterBarRef.current;
      if (!bar) return;
      const btnRect = btn.getBoundingClientRect();
      const barRect = bar.getBoundingClientRect();
      const left = btnRect.left - barRect.left + bar.scrollLeft;
      indicator.style.left = `${left}px`;
      indicator.style.width = `${btnRect.width}px`;
      // Note: removed auto-scroll of filter tab into view to not interfere with user scroll
    });
    return () => cancelAnimationFrame(rafId);
  }, [activeFilter, allFilters]);

  // Primary lesson hour per student
  const studentHourMap = useMemo(() => {
    const map: Record<string, number | null> = {};
    students.forEach((student) => {
      const studentLessons = lessons.filter((l) => l.studentId === student.id && isUserLesson(l));
      if (studentLessons.length === 0) {
        map[student.id] = null;
        return;
      }
      const hours = studentLessons.map((l) => parseInt(l.time.split(':')[0]));
      const hourCounts = hours.reduce((acc, h) => {
        acc[h] = (acc[h] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);
      const maxHour = Object.entries(hourCounts).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      map[student.id] = parseInt(maxHour);
    });
    return map;
  }, [students, lessons]);

  // Apply smart filter to student list (no smart filters currently used)
  const applySmartFilter = useCallback((list: Student[], _filterId: string) => list, []);

  // Get students for a specific filter (used by SwipeTabs)
  const getStudentsForFilter = useCallback((filterId: string): Student[] => {
    let list = students.filter((s) => s.fullName !== 'System Block' && s.id !== 'system');
    
    // Apply built-in filter
    switch (filterId) {
      case 'regular': return list.filter((s) => s.isRecurring && s.status === 'active' && !s.isFrozen);
      case 'evening': return list.filter((s) => { const h = studentHourMap[s.id]; return h !== null && h >= 17 && s.status === 'active' && !s.isFrozen; });
      case 'any_time': return list.filter((s) => s.status === 'active' && !s.isFrozen);
      case 'frozen': return list.filter((s) => s.isFrozen);
      case 'reserve': return list.filter((s) => s.status === 'reserve');
      default:
        if (filterId.startsWith('custom:')) {
          const filterName = filterId.replace('custom:', '');
          return list.filter((s) => s.sections?.includes(filterName));
        }
        // Unknown filter ID (e.g. __new__:...) — return empty
        return [];
    }
    return list;
  }, [students, studentHourMap]);

  // Filter students based on active filter
  const filteredStudents = useMemo(() => {
    let list = students.filter((s) => s.fullName !== 'System Block' && s.id !== 'system');
    
    // Apply built-in filter
    switch (activeFilter) {
      case 'regular': return list.filter((s) => s.isRecurring && s.status === 'active' && !s.isFrozen);
      case 'evening': return list.filter((s) => { const h = studentHourMap[s.id]; return h !== null && h >= 17 && s.status === 'active' && !s.isFrozen; });
      case 'any_time': return list.filter((s) => s.status === 'active' && !s.isFrozen);
      case 'frozen': return list.filter((s) => s.isFrozen);
      case 'reserve': return list.filter((s) => s.status === 'reserve');
      default:
        if (activeFilter.startsWith('custom:')) {
          const filterName = activeFilter.replace('custom:', '');
          return list.filter((s) => s.sections?.includes(filterName));
        }
        break;
    }
    
    return list;
  }, [students, activeFilter, studentHourMap]);

  // Apply period filter
  const periodFilteredStudents = useMemo(() => {
    if (!activePeriod) return filteredStudents;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
    const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');
    const todayStr = format(today, 'yyyy-MM-dd');

    const sets = {
      yesterday: new Set<string>(),
      today: new Set<string>(),
      tomorrow: new Set<string>(),
      week: new Set<string>(),
      month: new Set<string>(),
    };

    filteredStudents.forEach((student) => {
      const studentLessons = lessons.filter((l) => l.studentId === student.id && isUserLesson(l));
      studentLessons.forEach((lesson) => {
        const lessonDate = new Date(lesson.date + 'T00:00:00');
        if (lesson.date === yesterdayStr) sets.yesterday.add(student.id);
        if (lesson.date === todayStr) sets.today.add(student.id);
        if (lesson.date === tomorrowStr) sets.tomorrow.add(student.id);
        if (isThisWeek(lessonDate, { weekStartsOn: 1 })) sets.week.add(student.id);
        if (isThisMonth(lessonDate)) sets.month.add(student.id);
      });
    });

    let list = filteredStudents;
    if (activePeriod === 'yesterday') list = list.filter((s) => sets.yesterday.has(s.id));
    else if (activePeriod === 'today') list = list.filter((s) => sets.today.has(s.id));
    else if (activePeriod === 'tomorrow') list = list.filter((s) => sets.tomorrow.has(s.id));
    else if (activePeriod === 'week') list = list.filter((s) => sets.week.has(s.id));
    else if (activePeriod === 'month') list = list.filter((s) => sets.month.has(s.id));

    return list;
  }, [filteredStudents, activePeriod, lessons]);

  // Apply search filter
  const searchedStudents = useMemo(() => {
    let list = periodFilteredStudents;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter((s) => {
        // Match from start of any word in fullName (e.g. "ле" matches "Лера" or "Александр Лев")
        const nameMatch = s.fullName.toLowerCase().split(/\s+/).some((word) => word.startsWith(term));
        const sectionMatch = s.sections && s.sections.some((sec) => sec.toLowerCase().startsWith(term));
        return nameMatch || sectionMatch;
      });
    }
    return [...list].sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
  }, [periodFilteredStudents, searchTerm]);

  // Calculate income for filter
  const filterIncome = useMemo(() => {
    return searchedStudents.reduce((sum, s) => {
      const tariff = tariffs.find((t) => t.id === s.tariffId);
      return sum + (tariff?.price || 0);
    }, 0);
  }, [searchedStudents, tariffs]);

  // Get current filter label
  const currentFilterLabel = useMemo(() => {
    const filter = allFilters.find((f) => f.id === activeFilter);
    return filter?.label || activeFilter;
  }, [allFilters, activeFilter]);

  // Drag and drop for filter reordering
  const [draggedFilterId, setDraggedFilterId] = useState<string | null>(null);
  const [dragOverFilterId, setDragOverFilterId] = useState<string | null>(null);
  const [dragMode, setDragMode] = useState(false);

  const handleDragStart = (filterId: string, e: React.DragEvent) => {
    setDraggedFilterId(filterId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, filterId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFilterId(filterId);
  };

  const handleDragEnd = () => {
    if (draggedFilterId && dragOverFilterId && draggedFilterId !== dragOverFilterId) {
      const newOrder = [...filterOrder];
      const draggedIndex = newOrder.indexOf(draggedFilterId);
      const overIndex = newOrder.indexOf(dragOverFilterId);
      if (draggedIndex !== -1 && overIndex !== -1) {
        newOrder.splice(draggedIndex, 1);
        newOrder.splice(overIndex, 0, draggedFilterId);
        setFilterOrder(newOrder);
      }
    }
    setDraggedFilterId(null);
    setDragOverFilterId(null);
    setDragMode(false);
  };

  // Touch support for filter reordering
  const [touchItem, setTouchItem] = useState<{ id: string; startX: number; startY: number } | null>(null);

  const handleFilterTouchStart = (filterId: string, e: React.TouchEvent) => {
    if (!dragMode) return;
    const touch = e.touches[0];
    setTouchItem({ id: filterId, startX: touch.clientX, startY: touch.clientY });
    setDraggedFilterId(filterId);
  };

  const handleFilterTouchMove = (e: React.TouchEvent) => {
    if (!dragMode || !touchItem) return;
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchItem.startX);
    const deltaY = Math.abs(touch.clientY - touchItem.startY);
    // Cancel drag if user scrolled down more than 15px (vertical scroll intent)
    if (deltaY > 15) {
      setTouchItem(null);
      setDraggedFilterId(null);
      setDragOverFilterId(null);
      setDragMode(false);
      return;
    }
    if (deltaX > 10) {
      // User is dragging horizontally, prevent default scroll
      e.preventDefault();
    }
    // Find element under touch for hover effect
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const filterEl = el?.closest('[data-filterid]') as HTMLElement | null;
    if (filterEl) {
      const overId = filterEl.getAttribute('data-filterid');
      if (overId && overId !== touchItem.id) {
        setDragOverFilterId(overId);
      }
    }
  };

  const handleFilterTouchEnd = (e?: React.TouchEvent) => {
    if (!touchItem) return;
    // Only process reordering if we have the touch event (from direct touch, not SwipeTabs)
    if (e) {
      const touch = e.changedTouches[0];
      const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
      const filterElement = elementBelow?.closest('[data-filterid]');
      if (filterElement) {
        const overId = filterElement.getAttribute('data-filterid');
        if (overId && overId !== touchItem.id) {
          const newOrder = [...filterOrder];
          const draggedIndex = newOrder.indexOf(touchItem.id);
          const overIndex = newOrder.indexOf(overId);
          if (draggedIndex !== -1 && overIndex !== -1) {
            newOrder.splice(draggedIndex, 1);
            newOrder.splice(overIndex, 0, touchItem.id);
            setFilterOrder(newOrder);
          }
        }
      }
    }
    setTouchItem(null);
  };

  // Click outside to close menus
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-menu]')) return;
      if (filterMenuRef.current && !filterMenuRef.current.contains(target)) {
        setFilterMenuId(null);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, []);

  // Click outside to close period menu
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (periodMenuRef.current && !periodMenuRef.current.contains(e.target as Node)) {
        setShowPeriodMenu(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, []);

  // Section menu state (must be declared before any conditional return)
  const [sectionMenuStudent, setSectionMenuStudent] = useState<string | null>(null);
  const [sectionMenuPos, setSectionMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [sectionMenuMode, setSectionMenuMode] = useState<'action' | 'move' | 'copy'>('action');

  // Click outside to close section menu
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-sectionmenu]')) {
        setSectionMenuStudent(null);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, []);

  // Close menus on window scroll (not on inner container scroll)
  useEffect(() => {
    const handler = (e: Event) => {
      if (e.target === document || e.target === document.documentElement || e.target === document.body) {
        setFilterMenuId(null);
        setShowPeriodMenu(false);
        setSectionMenuStudent(null);
      }
    };
    window.addEventListener('scroll', handler, true);
    return () => window.removeEventListener('scroll', handler, true);
  }, []);

  // Initialize data
  useEffect(() => {
    setIsInitialized(true);
  }, []);

  // Attach non-passive touch listeners so e.preventDefault() works during pinch
  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        isPinchingRef.current = true;
        el.style.touchAction = 'none';
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchStartDistance.current = Math.sqrt(dx * dx + dy * dy);
        touchStartScale.current = useAppStore.getState().studentsScale ?? 0.6;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && isPinchingRef.current) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ratio = dist / touchStartDistance.current;
        const sensitiveRatio = 1 + (ratio - 1) * 2.0;
        const next = Math.min(2.0, Math.max(0.4, touchStartScale.current * sensitiveRatio));
        if (zoomThrottleRef.current === null) {
          zoomThrottleRef.current = requestAnimationFrame(() => {
            useAppStore.getState().setStudentsScale(next);
            zoomThrottleRef.current = null;
          });
        }
      }
    };
    const onTouchEnd = () => {
      isPinchingRef.current = false;
      el.style.touchAction = 'pan-x pan-y';
    };
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-neon-purple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (showLearningHistory) {
    return (
      <ModalErrorBoundary onClose={() => setShowLearningHistory(false)}>
        <LearningHistory onBack={() => setShowLearningHistory(false)} />
      </ModalErrorBoundary>
    );
  }

  // Table header component
  const TheadRow = () => {
    const thCls = 'py-2 px-2 text-center text-[10px] font-semibold text-white/70 border-r border-white/[0.08]';
    return (
      <tr>
        <th className={`${thCls} w-7`}>№</th>
        <th className={`${thCls}`}>ФИО</th>
        <th className={`${thCls} w-12`}>Зан.</th>
        <th className={`${thCls} w-20`}>Нач.абон.</th>
        <th className={`${thCls} w-24`}>Кон.абон.</th>
        <th className={`${thCls} whitespace-nowrap`}>Тариф</th>
        <th className={`${thCls} w-14`}>Отзыв</th>
        <th className={`${thCls} w-20`}>Нач.учёбы</th>
        <th className={`${thCls} w-24`}>Раздел</th>
        <th className="py-2 px-2 text-center text-[10px] font-semibold text-white/70">Действия</th>
      </tr>
    );
  };

  // Table row component
  const TableRow = ({ student, idx }: { student: Student; idx: number }) => {
    const tariff = tariffs.find((t) => t.id === student.tariffId);
    const tariffLessons = tariff ? `${tariff.lessons} зан.` : (student.tariff ? '1 зан.' : '—');
    const rawTariffName: string = tariff ? tariff.name : (student.tariff ? String(student.tariff) : '—');
    const tariffName = rawTariffName;
    const balanceBg =
      student.balance <= 0 ? 'bg-orange-500 text-white' :
      student.balance <= 2 ? 'bg-amber-400 text-black' :
      'bg-yellow-300 text-black';
    
    // Check if student has ANY real (billable) lessons in schedule
    const hasAnyLessons = lessons.some(
      l => l.studentId === student.id &&
           !l.isFreeSlot &&
           l.lessonType !== 'break' &&
           l.lessonType !== 'business'
    );

    // Subscription dates — only show if student has lessons in schedule
    const subStartDate = hasAnyLessons ? (student.abonStart || student.lastPaymentDate) : null;
    const subStart = subStartDate
      ? format(new Date(subStartDate), 'dd.MM.yy')
      : '—';

    // End = last covered lesson date based on actual schedule and consumed balance
    let subEnd = '—';
    if (!hasAnyLessons) {
      subEnd = '—';
    } else if (student.isFrozen) {
      subEnd = 'не действует';
    } else if (student.balance <= 0) {
      subEnd = 'закончился';
    } else if (student.abonStart) {
      // All real lessons from abonStart onwards that actually consume balance
      const cycleLessons = lessons
        .filter((l) => {
          if (l.studentId !== student.id) return false;
          if (l.isFreeSlot) return false;
          if (l.lessonType === 'single' || l.lessonType === 'one_time' || l.lessonType === 'break' || l.lessonType === 'business') return false;
          if (l.rescheduledFrom) return false;
          if (l.date < student.abonStart!) return false;
          const r = dailyReports.find((x) => x.lessonId === l.id && x.date === l.date);
          if (r && (r.status === 'rescheduled' || r.status === 'frozen')) return false;
          return true;
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Count already consumed lessons via daily reports (present or absent both charge balance)
      const consumedInCycle = cycleLessons.filter((l) => {
        const report = dailyReports.find((r) => r.lessonId === l.id && r.date === l.date);
        return report && (report.status === 'present' || report.status === 'absent');
      }).length;

      const coveredCount = consumedInCycle + student.balance;

      if (coveredCount > 0) {
        if (coveredCount <= cycleLessons.length) {
          // Last covered lesson is inside existing schedule
          subEnd = `до ${format(new Date(cycleLessons[coveredCount - 1].date), 'dd.MM.yy')}`;
        } else if (cycleLessons.length > 0) {
          // Need to extrapolate past last scheduled lesson
          const lastLesson = cycleLessons[cycleLessons.length - 1];
          let interval = 7; // default one week
          if (cycleLessons.length >= 2) {
            const lastDate = new Date(lastLesson.date).getTime();
            const prevDate = new Date(cycleLessons[cycleLessons.length - 2].date).getTime();
            interval = Math.max(1, Math.round((lastDate - prevDate) / (1000 * 60 * 60 * 24)));
          }
          const extraLessons = coveredCount - cycleLessons.length;
          const endDate = addDays(new Date(lastLesson.date), extraLessons * interval);
          subEnd = `до ${format(endDate, 'dd.MM.yy')}`;
        } else {
          // No lessons scheduled yet — fallback to tariff-based estimate from abonStart
          const lessonsPerMonth = tariff ? tariff.lessons : 4;
          const daysPerLesson = 30 / Math.max(1, lessonsPerMonth);
          const endDate = addDays(new Date(student.abonStart), Math.round(student.balance * daysPerLesson));
          subEnd = `до ${format(endDate, 'dd.MM.yy')}`;
        }
      }
    } else if (hasAnyLessons && student.lastPaymentDate) {
      // No abonStart yet — fallback to tariff-based estimate from payment date
      const lessonsPerMonth = tariff ? tariff.lessons : 4;
      const daysPerLesson = 30 / Math.max(1, lessonsPerMonth);
      const endDate = addDays(new Date(student.lastPaymentDate), Math.round(student.balance * daysPerLesson));
      subEnd = `до ${format(endDate, 'dd.MM.yy')}`;
    }
    
    const studentSectionLabels = getStudentFilterLabels(student) || [];
    const cellCls = 'border-r border-white/[0.08]';

    return (
      <tr
        className="hover:bg-white/5 cursor-pointer transition-colors border-b border-white/[0.08]"
        onClick={() => handleEditStudent(student)}
      >
        <td className={`py-2 px-2 text-white/40 text-xs ${cellCls}`}>{idx}</td>
        <td className={`py-2 px-2 ${cellCls}`}>
          <div className="font-medium text-xs leading-tight">{student.fullName}</div>
          {student.isFrozen && <Snowflake className="w-3 h-3 text-cyan-400 mt-0.5" />}
        </td>
                <td className={`py-2 px-2 text-center ${cellCls}`}>
          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${balanceBg}`}>
            {student.balance}
          </span>
        </td>
        <td className={`py-2 px-2 text-center text-white/60 text-[10px] ${cellCls}`}>{subStart}</td>
        <td className={`py-2 px-2 text-center text-[10px] ${cellCls}`}>
          <span className={student.isFrozen ? 'text-cyan-400' : 'text-white/60'}>{subEnd}</span>
          {student.isFrozen && <Snowflake className="inline w-2.5 h-2.5 ml-0.5 text-cyan-400" />}
        </td>
        <td className={`py-2 px-2 text-center text-white/60 text-[10px] whitespace-nowrap ${cellCls}`} title={rawTariffName}>{tariffName}</td>
        <td className={`py-2 px-2 text-center ${cellCls}`}>
          <span className={`text-[10px] ${student.hasReview ? 'text-emerald-400' : 'text-white/25'}`}>
            {student.hasReview ? 'Да' : '—'}
          </span>
        </td>
        <td className={`py-2 px-1 text-center ${cellCls}`} onClick={(e) => e.stopPropagation()}>
          <input
            key={student.studyStart || ''}
            type="text"
            defaultValue={student.studyStart || ''}
            placeholder="—"
            maxLength={10}
            onBlur={(e) => {
              const val = e.target.value.trim();
              if (val !== (student.studyStart || '')) {
                updateStudent(student.id, { studyStart: val });
              }
            }}
            className="w-full text-center text-[10px] bg-transparent border-none outline-none focus:bg-white/10 rounded px-1 py-0.5 text-white/70 placeholder-white/20"
          />
        </td>
        <td className={`py-2 px-2 relative ${cellCls}`} onClick={(e) => e.stopPropagation()}>
          <button
            data-sectionmenu
            onClick={(e) => {
              if (sectionMenuStudent === student.id) { setSectionMenuStudent(null); return; }
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setSectionMenuPos({ x: rect.left, y: rect.bottom + 4 });
              setSectionMenuMode('action');
              setSectionMenuStudent(student.id);
            }}
            className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-white/70 w-full"
          >
            <span className="flex-1 text-left leading-tight">
              {studentSectionLabels.length > 0
                ? <span className="text-sm leading-none">{studentSectionLabels[0]}{studentSectionLabels.length > 1 ? <span className="text-[9px] text-white/40 ml-0.5">+{studentSectionLabels.length - 1}</span> : null}</span>
                : <span className="text-white/25">—</span>}
            </span>
            <ChevronDown className="w-2.5 h-2.5 shrink-0" />
          </button>
        </td>
        <td className="py-2 px-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-0.5 justify-end">
            <button
              onClick={(e) => handleMarkPaid(student, e)}
              className="px-1.5 py-1 rounded-lg bg-emerald-500/80 hover:bg-emerald-500 text-white text-[10px] font-medium transition-colors"
            >
              Оплатил
            </button>
            {(() => {
              const thisMonth = new Date().toISOString().slice(0, 7);
              const alreadyFrozenThisMonth = !student.isFrozen && student.lastFreezeMonth === thisMonth;
              return (
                <button
                  onClick={(e) => handleToggleFreeze(student, e)}
                  className={`p-3 rounded-lg transition-colors ${
                    student.isFrozen
                      ? 'bg-cyan-500/30 text-cyan-300 hover:bg-cyan-500/50'
                      : alreadyFrozenThisMonth
                        ? 'text-white/15 cursor-not-allowed'
                        : 'text-white/30 hover:text-cyan-400 hover:bg-cyan-500/10'
                  }`}
                  title={student.isFrozen ? 'Разморозить' : alreadyFrozenThisMonth ? 'Заморозка уже использована в этом месяце' : 'Заморозить'}
                >
                  <Snowflake className="w-4 h-4" />
                </button>
              );
            })()}
            <button
              onClick={(e) => { e.stopPropagation(); handleDeleteStudent(student); }}
              className="p-1 rounded-lg hover:bg-red-500/20 text-white/20 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  // Event handlers
  const handleAddStudent = () => {
    setSelectedStudent(undefined);
    setShowModal(true);
  };

  const handleEditStudent = (student: Student) => {
    setSelectedStudent(student);
    setShowModal(true);
  };

  const handleDeleteStudent = (student: Student) => {
    if (confirm(`Удалить ученика ${student.fullName}?`)) {
      deleteStudent(student.id);
      showToast('Ученик удалён', 'success');
    }
  };

  const handleMarkPaid = (student: Student, e: React.MouseEvent) => {
    e.stopPropagation();
    const t = tariffs.find((x) => x.id === student.tariffId);
    if (!t) return;
    const el = tableContainerRef.current;
    const savedTop = el?.scrollTop ?? 0;
    recordPayment(student.id, t.lessons, '');
    requestAnimationFrame(() => {
      if (el) el.scrollTop = savedTop;
    });
    showToast(`Пополнено на ${t.lessons} занятий`, 'success');
  };

  const calcRestoredLessons = (student: Student, freezeStart: string, freezeEnd: string) => {
    const tariff = tariffs.find((t) => t.id === student.tariffId);
    if (!tariff || tariff.lessons === 0) return 0;
    const days = Math.max(0, Math.round(
      (new Date(freezeEnd).getTime() - new Date(freezeStart).getTime()) / (1000 * 60 * 60 * 24)
    ));
    return Math.round(days * (tariff.lessons / 30));
  };

  const handleToggleFreeze = (student: Student, e: React.MouseEvent) => {
    e.stopPropagation();
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.slice(0, 7); // "YYYY-MM"
    if (student.isFrozen) {
      const freezeStart = student.freezeFrom || today;
      const restored = calcRestoredLessons(student, freezeStart, today);
      const currentStudent = students.find((s) => s.id === student.id);
      const currentBalance = currentStudent ? currentStudent.balance : student.balance;
      const newBalance = currentBalance + restored;

      const tariffForCalc = tariffs.find((t) => t.id === student.tariffId);
      const daysPerLesson = 30 / Math.max(1, tariffForCalc ? tariffForCalc.lessons : 4);
      const lastPayment = student.lastPaymentDate ? new Date(student.lastPaymentDate) : new Date();
      const newEndStr = format(addDays(lastPayment, Math.round(newBalance * daysPerLesson)), 'dd.MM.yyyy');
      updateStudent(student.id, { isFrozen: false, freezeTo: today, balance: newBalance });
      showToast(`Разморожен. +${restored} ур. Абон. до ${newEndStr}`, 'success');
    } else {
      if (student.lastFreezeMonth === currentMonth) {
        showToast('Заморозка уже использована в этом месяце', 'error');
        return;
      }
      updateStudent(student.id, { isFrozen: true, freezeFrom: today, freezeTo: undefined, lastFreezeMonth: currentMonth });
      showToast('Заморожен с ' + format(new Date(today), 'dd.MM.yyyy'), 'info');
    }
  };

  const getStudentFilterLabels = (student: Student) => {
    // ...
    const builtinLabel = (() => {
      if (student.isFrozen) return builtinLabels['frozen'] || 'Замороженные';
      if (student.status === 'reserve') return builtinLabels['reserve'] || 'Резерв';
      if (student.isRecurring && student.status === 'active') return builtinLabels['regular'] || 'Постоянные';
      return null;
    })();
    const custom = student.sections || [];
    if (builtinLabel && !custom.includes(builtinLabel)) return [builtinLabel, ...custom];
    return custom;
  };

  const handleSectionMove = (student: Student, targetSection: string) => {
    // Check if target is a built-in filter (reserve) or custom section
    const isBuiltinFilter = ['regular', 'evening', 'any_time', 'frozen', 'reserve'].includes(targetSection);
    
    if (isBuiltinFilter) {
      // For built-in filters, update status accordingly
      let newStatus = student.status;
      let newIsFrozen = student.isFrozen;
      let newIsRecurring = student.isRecurring;
      
      switch (targetSection) {
        case 'reserve':
          newStatus = 'reserve';
          break;
        case 'frozen':
          newIsFrozen = true;
          break;
        case 'regular':
          newStatus = 'active';
          newIsRecurring = true;
          newIsFrozen = false;
          break;
        case 'evening':
        case 'any_time':
          newStatus = 'active';
          newIsFrozen = false;
          break;
      }
      
      updateStudent(student.id, { 
        status: newStatus, 
        isFrozen: newIsFrozen,
        isRecurring: newIsRecurring,
        sections: [targetSection],
        section: targetSection 
      });
    } else {
      // For custom sections, just update sections
      const newSections = [targetSection];
      updateStudent(student.id, { sections: newSections, section: targetSection });
    }
    
    setSectionMenuStudent(null);
    showToast(`Перенесён в раздел "${targetSection}"`, 'info');
  };

  const handleSectionCopy = (student: Student, targetSection: string) => {
    const currentSections = student.sections || [];
    const newSections = currentSections.includes(targetSection)
      ? currentSections.filter((s) => s !== targetSection)
      : [...currentSections, targetSection];
    updateStudent(student.id, { sections: newSections });
    setSectionMenuStudent(null);
    showToast(newSections.includes(targetSection) ? `Добавлен в раздел "${targetSection}"` : `Удалён из раздела "${targetSection}"`, 'info');
  };

  const getSections = (student: Student) => {
    return student.sections || [];
  };

  const handleSectionRemoveCurrent = (student: Student) => {
    const cur = getSections(student).filter((s) => s !== activeFilter.replace('custom:', ''));
    updateStudent(student.id, { sections: cur, section: cur[0] || '' });
    setSectionMenuStudent(null);
    showToast('Удалён из текущей зоны', 'info');
  };

  const handleSectionRemoveAll = (student: Student) => {
    updateStudent(student.id, { sections: [], section: '' });
    setSectionMenuStudent(null);
    showToast('Удалён из всех зон', 'info');
  };

  const cancelFilterEdit = (_f?: FilterDef) => {
    if (isNewFilter) {
      setActiveFilter('regular');
    }
    setEditingFilterId(null);
    setIsNewFilter(false);
    setShowEmojiPicker(false);
  };

  const saveFilterRename = (f: FilterDef) => {
    const newLabel = editingFilterLabel.trim();
    if (!newLabel) { cancelFilterEdit(f); return; }
    if (isNewFilter && editingFilterId) {
      // Remove temp entry from filterOrder and add the real custom filter ID
      setFilterOrder(prev => {
        const cleaned = prev.filter(id => id !== editingFilterId);
        return [...cleaned, `custom:${newLabel}`];
      });
      setBuiltinLabels((prev: Record<string, string>) => {
        const next = { ...prev };
        delete next[editingFilterId];
        return next;
      });
      addCustomStudentFilter(newLabel);
      setActiveFilter(`custom:${newLabel}`);
      setEditingFilterId(null);
      setFilterMenuId(null);
      setIsNewFilter(false);
      setShowEmojiPicker(false);
      return;
    }
    if (f.builtin) {
      setBuiltinLabels((prev: Record<string, string>) => ({ ...prev, [f.id]: newLabel }));
    } else {
      const oldName = f.id.replace('custom:', '');
      removeCustomStudentFilter(oldName);
      addCustomStudentFilter(newLabel);
      if (activeFilter === f.id) setActiveFilter(`custom:${newLabel}`);
    }
    setEditingFilterId(null);
    setFilterMenuId(null);
    setShowEmojiPicker(false);
  };

  return (
    <div className="flex flex-col h-full overflow-x-hidden">
      {/* Header */}
      <div className="glass-medium px-3 pt-3 pb-0 space-y-2 shrink-0">
        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddStudent}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neon-purple hover:bg-neon-purple/80 transition-colors text-sm font-medium flex-1 justify-center"
          >
            <Plus className="w-4 h-4" />
            Ученик
          </button>
          {/* Period sort button */}
          <div ref={periodMenuRef}>
            <button
              onClick={(e) => {
                if (showPeriodMenu) { setShowPeriodMenu(false); return; }
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setPeriodMenuPos({ x: rect.right, y: rect.bottom + 4 });
                setShowPeriodMenu(true);
              }}
              title="Фильтр по периоду"
              className={`flex items-center gap-1 px-2.5 py-2 text-xs rounded-xl whitespace-nowrap transition-colors ${
                activePeriod ? 'bg-neon-purple/20 text-neon-purple border border-neon-purple/40' : 'bg-white/10 hover:bg-white/20 text-white/70'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              {activePeriod === 'yesterday' ? 'Вчера' : activePeriod === 'today' ? 'Сег.' : activePeriod === 'tomorrow' ? 'Завтра' : activePeriod === 'week' ? 'Нед.' : activePeriod === 'month' ? 'Мес.' : ''}
            </button>
          </div>
          <button
            onClick={() => setShowLearningHistory(true)}
            className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-xs font-medium justify-center"
          >
            <GraduationCap className="w-3.5 h-3.5" />
            История
          </button>
        </div>

        {/* Search and filter controls */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              placeholder="Поиск по имени или разделу..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-neon-purple text-sm"
            />
          </div>
        </div>

        {/* Add new filter button */}
        <div className="px-3 pb-2">
          <button
            onClick={() => {
              const tempId = `__new__:${Date.now()}`;
              setEditingFilterId(tempId);
              setEditingFilterLabel('');
              setIsNewFilter(true);
              setActiveFilter(tempId);
            }}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors border border-white/10"
            title="Добавить раздел"
          >
            <span className="text-lg leading-none">+</span>
            <span>Раздел</span>
          </button>
        </div>

        {/* New filter editor panel */}
        {isNewFilter && editingFilterId && (() => {
          const f = allFilters.find(fl => fl.id === editingFilterId)!;
          return f ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border-t border-white/10">
              <input
                autoFocus
                value={editingFilterLabel}
                onChange={(e) => setEditingFilterLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveFilterRename(f);
                  if (e.key === 'Escape') cancelFilterEdit(f);
                  e.stopPropagation();
                }}
                placeholder="Название раздела"
                className="flex-1 text-xs bg-transparent outline-none border-b border-neon-purple/60 px-1 py-0.5"
              />
              <button onClick={() => saveFilterRename(f)} className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => cancelFilterEdit(f)} className="p-1.5 rounded-lg bg-white/5 text-white/60 hover:bg-white/10">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : null;
        })()}
      </div>{/* end glass-medium header */}
      <div className="w-full h-px bg-white/10 shrink-0" />

      {/* Filter tabs with three dots menu and swipe */}
      <SwipeTabs
        tabs={allFilters.map((f) => ({ id: f.id, label: f.label }))}
        activeId={activeFilter}
        onTabChange={setActiveFilter}
        dragMode={dragMode}
        disableSwipe={true}
        wobble={true}
        onCatDragStart={(id) => { setDraggedFilterId(id); }}
        onCatDragOver={(_, id) => { setDragOverFilterId(id); }}
        onCatDragEnd={() => {
          if (draggedFilterId && dragOverFilterId && draggedFilterId !== dragOverFilterId) {
            const newOrder = [...filterOrder];
            const draggedIndex = newOrder.indexOf(draggedFilterId);
            const overIndex = newOrder.indexOf(dragOverFilterId);
            if (draggedIndex !== -1 && overIndex !== -1) {
              newOrder.splice(draggedIndex, 1);
              newOrder.splice(overIndex, 0, draggedFilterId);
              setFilterOrder(newOrder);
            }
          }
          setDraggedFilterId(null);
          setDragOverFilterId(null);
          setDragMode(false);
        }}
        onCatTouchStart={(id, e) => handleFilterTouchStart(id, e)}
        onCatTouchMove={(e) => handleFilterTouchMove(e)}
        onCatTouchEnd={() => handleFilterTouchEnd()}
        onTabMenu={(id, rect) => {
          setFilterMenuPos({ x: rect.left, y: rect.bottom + 4 });
          setFilterMenuId(id);
        }}
      >
        {allFilters.map((filter) => {
          const filterStudents = getStudentsForFilter(filter.id)
            .filter((s) => {
              if (!activePeriod) return true;
              const today = new Date().toISOString().split('T')[0];
              const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
              const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
              const studentLessons = lessons.filter((l) => l.studentId === s.id && isUserLesson(l));
              if (activePeriod === 'yesterday') return studentLessons.some((l) => l.date === yesterday);
              if (activePeriod === 'today') return studentLessons.some((l) => l.date === today);
              if (activePeriod === 'tomorrow') return studentLessons.some((l) => l.date === tomorrow);
              if (activePeriod === 'week') return studentLessons.some((l) => isThisWeek(new Date(l.date + 'T00:00:00'), { weekStartsOn: 1 }));
              if (activePeriod === 'month') return studentLessons.some((l) => isThisMonth(new Date(l.date + 'T00:00:00')));
              return true;
            })
            .filter((s) => {
              if (!searchTerm.trim()) return true;
              const term = searchTerm.toLowerCase();
              const matchesName = s.fullName.toLowerCase().split(/\s+/).some((word) => word.startsWith(term));
              const matchesPhone = s.phone?.toLowerCase().includes(term) || false;
              return matchesName || matchesPhone;
            })
            .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));

          return (
            <div
              key={filter.id}
              className="flex-1 overflow-x-auto overflow-y-auto pinch-zoom-container h-full"
              style={{ touchAction: 'pan-x pan-y', overscrollBehavior: 'contain' }}
              onScroll={(e) => { scrollPositionsRef.current[filter.id] = (e.currentTarget as HTMLDivElement).scrollTop; }}
              ref={(el) => {
                tableContainerRefs.current.set(filter.id, el);
                if (el) {
                  const saved = scrollPositionsRef.current[filter.id];
                  if (saved !== undefined) el.scrollTop = saved;
                }
              }}
            >
              {filterStudents.length > 0 ? (
                <div style={{ minWidth: 'max-content', zoom: studentsScale }}>
                  <table className="w-full min-w-[680px] text-sm border-collapse">
                    <thead className="sticky top-0 z-10 bg-dark-900 backdrop-blur-sm">
                      <TheadRow />
                    </thead>
                    <tbody>
                      {filterStudents.map((s, i) => <TableRow key={s.id} student={s} idx={i + 1} />)}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-white/40">
                  <UserCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Нет учеников</p>
                  <button onClick={handleAddStudent} className="mt-3 text-sm text-neon-purple hover:underline">Добавить первого</button>
                </div>
              )}
            </div>
          );
        })}
      </SwipeTabs>

      {/* Status bar */}
      <div className="glass-medium px-4 py-2.5 border-t border-white/10 flex items-center justify-center shrink-0">
        <span className="text-xs text-white/50">{currentFilterLabel}: {searchedStudents.length} уч.</span>
      </div>

      {/* Modals */}
      {showModal && (
        <ModalErrorBoundary onClose={() => setShowModal(false)}>
          <StudentModal student={selectedStudent || undefined} onClose={() => setShowModal(false)} />
        </ModalErrorBoundary>
      )}

      {showTariffModal && <TariffQuickModal onClose={() => setShowTariffModal(false)} />}

      {/* Period menu */}
      {showPeriodMenu && (
        <div
          ref={periodMenuRef}
          className="fixed z-[9999] w-32 rounded-xl shadow-xl overflow-hidden border border-white/10"
          style={{ background: 'rgba(15,8,35,0.98)', backdropFilter: 'blur(12px)', right: `calc(100vw - ${periodMenuPos.x}px)`, top: periodMenuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {(['yesterday', 'today', 'tomorrow', 'week', 'month'] as const).map((p) => (
            <button key={p}
              onClick={() => { setActivePeriod(activePeriod === p ? null : p); setShowPeriodMenu(false); }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between ${
                activePeriod === p ? 'text-neon-purple bg-neon-purple/10' : 'text-white hover:bg-white/10'
              }`}>
              <span>{p === 'yesterday' ? 'Вчера' : p === 'today' ? 'Сегодня' : p === 'tomorrow' ? 'Завтра' : p === 'week' ? 'Неделя' : 'Месяц'}</span>
              {activePeriod === p && <Check className="w-3 h-3" />}
            </button>
          ))}
          <button onClick={() => { setActivePeriod(null); setShowPeriodMenu(false); }}
            className="w-full text-left px-3 py-2 text-xs text-white/40 hover:bg-white/10 transition-colors border-t border-white/10">
            ✕ Сбросить
          </button>
        </div>
      )}

      {/* Filter context menu */}
      {(() => {
        const f = filterMenuId ? allFilters.find((fl) => fl.id === filterMenuId) : null;
        if (!f || !filterMenuId) return null;
        // Dynamic positioning to prevent overflow
        const menuWidth = 160;
        const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 375;
        const isNearRightEdge = filterMenuPos.x > viewportWidth - menuWidth - 16;
        const leftPos = isNearRightEdge 
          ? Math.max(4, filterMenuPos.x - menuWidth + 20)
          : Math.max(4, Math.min(filterMenuPos.x, viewportWidth - menuWidth - 8));
        return (
          <div
            ref={filterMenuRef}
            data-filtermenu
            className="fixed z-[9999] w-40 rounded-xl shadow-2xl overflow-hidden border border-white/10"
            style={{ background: 'rgba(15,8,35,0.98)', backdropFilter: 'blur(12px)', left: leftPos, top: filterMenuPos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-2.5 text-xs text-white hover:bg-white/10 flex items-center gap-2"
              onClick={() => { setEditingFilterId(f.id); setEditingFilterLabel(f.label); setFilterMenuId(null); }}
            >
              ✏️ Переименовать
            </button>
            <button
              className="w-full text-left px-3 py-2.5 text-xs text-white hover:bg-white/10 flex items-center gap-2"
              onClick={() => { setDragMode(true); setFilterMenuId(null); setTimeout(() => setDragMode(false), 30000); }}
            >
              ↔️ Переместить
            </button>
            {!(f.builtin && f.id === 'frozen') && <button
              className="w-full text-left px-3 py-2.5 text-xs text-red-400 hover:bg-white/10 flex items-center gap-2"
              onClick={() => {
                if (f.builtin) {
                  setFilterOrder((prev: string[]) => prev.filter((id) => id !== f.id));
                } else {
                  removeCustomStudentFilter(f.id.replace('custom:', ''));
                }
                if (activeFilter === f.id) setActiveFilter('regular');
                setFilterMenuId(null);
              }}
            >
              🗑 Удалить
            </button>}
          </div>
        );
      })()}

      {/* Section menu — two-level: pick action then pick target */}
      {sectionMenuStudent && (() => {
        const student = students.find((s) => s.id === sectionMenuStudent)
          || archivedStudents.find((s) => s.id === sectionMenuStudent);
        if (!student) return null;
        // Build options with both ID and display label
        const builtinOptions = regularFilterTypes
          .filter((id: string) => id !== 'frozen')
          .map((id: string) => ({ id, label: builtinLabels[id] || id }));
        const customOptions = customStudentFilters.map((name: string) => ({ id: name, label: name }));
        const allSectionOptions = [...builtinOptions, ...customOptions];
        const studentCurrentSections = getStudentFilterLabels(student) || [];
        const sectionOptions = allSectionOptions.filter((opt) => !studentCurrentSections.includes(opt.label));
        const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 800;
        const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 600;
        const menuLeft = Math.min(sectionMenuPos.x, windowWidth - 196);
        const menuTop  = Math.min(sectionMenuPos.y, windowHeight - 320);
        return (
          <div
            data-sectionmenu
            className="fixed z-[9999] w-48 rounded-xl shadow-2xl overflow-hidden border border-white/10"
            style={{ background: 'rgba(20,10,40,0.97)', left: menuLeft, top: menuTop }}
            onClick={(e) => e.stopPropagation()}
          >
            {sectionMenuMode === 'action' ? (
              <>
                {/* Header */}
                <div className="px-3 py-2 text-[10px] font-semibold text-white/40 border-b border-white/10 tracking-wide uppercase">
                  Раздел
                </div>
                {/* Move */}
                <button
                  className="w-full text-left px-3 py-2.5 text-xs text-white hover:bg-white/10 flex items-center gap-2 transition-colors"
                  onClick={() => setSectionMenuMode('move')}
                >
                  <LogOut className="w-3.5 h-3.5 text-neon-purple" />
                  Перенести в...
                </button>
                {/* Copy */}
                <button
                  className="w-full text-left px-3 py-2.5 text-xs text-white hover:bg-white/10 flex items-center gap-2 transition-colors"
                  onClick={() => setSectionMenuMode('copy')}
                >
                  <Copy className="w-3.5 h-3.5 text-neon-purple" />
                  Добавить в...
                </button>
                {/* Remove from current */}
                {activeFilter !== 'regular' && (
                  <button
                    className="w-full text-left px-3 py-2.5 text-xs text-red-400 hover:bg-white/10 flex items-center gap-2 transition-colors"
                    onClick={() => handleSectionRemoveCurrent(student)}
                  >
                    <X className="w-3.5 h-3.5" />
                    Удалить из текущей
                  </button>
                )}
                {/* Remove all */}
                <button
                  className="w-full text-left px-3 py-2.5 text-xs text-red-400 hover:bg-white/10 flex items-center gap-2 transition-colors"
                  onClick={() => handleSectionRemoveAll(student)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Удалить из всех
                </button>
              </>
            ) : (
              <>
                {/* Header */}
                <div className="px-3 py-2 text-[10px] font-semibold text-white/40 border-b border-white/10 tracking-wide uppercase">
                  {sectionMenuMode === 'move' ? 'Перенести в' : 'Добавить в'}
                </div>
                {/* Back */}
                <button
                  className="w-full text-left px-3 py-2 text-xs text-white/40 hover:bg-white/10 flex items-center gap-2"
                  onClick={() => setSectionMenuMode('action')}
                >
                  ← Назад
                </button>
                {/* Section list */}
                <div className="overflow-y-auto" style={{ maxHeight: '50vh' }}>
                  {sectionOptions.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-white/30">Нет разделов</p>
                  ) : sectionOptions.map((opt) => (
                    <button
                      key={opt.id}
                      className="w-full text-left px-3 py-2.5 text-xs text-white hover:bg-white/10 transition-colors flex items-center justify-between"
                      onClick={() => {
                        if (!student) return;
                        if (sectionMenuMode === 'move') handleSectionMove(student, opt.id);
                        else handleSectionCopy(student, opt.id);
                      }}
                    >
                      <span>{opt.label}</span>
                      {sectionMenuMode === 'copy'
                        ? <Copy className="w-2.5 h-2.5 text-white/20" />
                        : <LogOut className="w-2.5 h-2.5 text-white/20" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// Tariff quick-add modal component
function TariffQuickModal({ onClose }: { onClose: () => void }) {
  const { addTariff } = useAppStore();
  const { showToast } = useToastStore();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [lessons, setLessons] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !price || !lessons) return;
    
    addTariff({
      name,
      price: parseInt(price),
      lessons: parseInt(lessons),
    });
    
    showToast('Тариф добавлен', 'success');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="glass-medium rounded-2xl p-6 max-w-md w-full">
        <h2 className="text-xl font-bold text-white mb-4">Новый тариф</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Название</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-neon-purple"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Цена (руб)</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-neon-purple"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Количество занятий</label>
            <input
              type="number"
              value={lessons}
              onChange={(e) => setLessons(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-neon-purple"
              required
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 rounded-xl bg-neon-purple hover:bg-neon-purple/80 transition-colors text-white font-medium"
            >
              Добавить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
