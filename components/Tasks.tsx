'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import SwipeTabs from './SwipeTabs';
import { Plus, Trash2, Edit2, Check, X, GripVertical, Bell, ChevronDown, ChevronUp, MoreHorizontal, Copy, ArrowRight } from 'lucide-react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { format } from 'date-fns';
import { useToastStore } from '@/store/toastStore';

// ─── Types ────────────────────────────────────────────────────────────────────
type CategoryId = string;
type LevelId = string;

interface TaskItem {
  id: string;
  text: string;
  details?: string;
  done: boolean;
  notifyAt?: string;
  repeatDaily?: boolean;
  levelId: LevelId;
  categoryId: CategoryId;
}

interface Level {
  id: LevelId;
  name: string;
  categoryId: CategoryId;
  color?: string;  // tailwind color class e.g. 'bg-neon-purple'
  emoji?: string;
}

interface Category {
  id: CategoryId;
  name: string;
}

const LEVEL_COLORS = [
  { cls: 'bg-neon-purple', label: '🟣' },
  { cls: 'bg-blue-500', label: '🔵' },
  { cls: 'bg-emerald-500', label: '🟢' },
  { cls: 'bg-amber-400', label: '🟡' },
  { cls: 'bg-red-500', label: '🔴' },
  { cls: 'bg-pink-500', label: '🩷' },
  { cls: 'bg-cyan-400', label: '🩵' },
  { cls: 'bg-white/30', label: '⚪' },
];

const LEVEL_COLOR_HEX: Record<string, string> = {
  'bg-neon-purple': '#a855f7',
  'bg-blue-500':    '#3b82f6',
  'bg-emerald-500': '#10b981',
  'bg-amber-400':   '#fbbf24',
  'bg-red-500':     '#ef4444',
  'bg-pink-500':    '#ec4899',
  'bg-cyan-400':    '#22d3ee',
  'bg-white/30':    'rgba(255,255,255,0.3)',
};

// ─── Storage ──────────────────────────────────────────────────────────────────
const STORE_KEY = 'tasks_v2';

interface TasksStore {
  categories: Category[];
  levels: Level[];
  tasks: TaskItem[];
}

const DEFAULT_STORE: TasksStore = {
  categories: [
    { id: 'daily', name: 'Ежедневное' },
    { id: 'weekly', name: 'Еженедельное' },
  ],
  levels: [
    { id: 'l1', name: '1 уровень', categoryId: 'daily', color: 'bg-neon-purple' },
    { id: 'l1w', name: '1 уровень', categoryId: 'weekly', color: 'bg-blue-500' },
  ],
  tasks: [],
};

function loadStore(): TasksStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return DEFAULT_STORE;
    const parsed = JSON.parse(raw) as Partial<TasksStore>;
    const rawCats = parsed.categories?.length ? parsed.categories : DEFAULT_STORE.categories;
    const seenIds = new Set<string>();
    const categories = rawCats
      .filter((c) => { if (seenIds.has(c.id)) return false; seenIds.add(c.id); return true; });
    return {
      categories,
      levels: parsed.levels ?? DEFAULT_STORE.levels,
      tasks: parsed.tasks || [],
    };
  } catch { return DEFAULT_STORE; }
}

function saveStore(s: TasksStore) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function getNotifId(taskId: string) {
  return Math.abs(parseInt(taskId.slice(-8), 16)) % 2147483647 || 1;
}

async function cancelTaskNotifications(taskId: string) {
  const base = getNotifId(taskId);
  const ids = [{ id: base }];
  for (let i = 1; i < 60; i++) ids.push({ id: base + i });
  try { await LocalNotifications.cancel({ notifications: ids }); } catch {}
}

async function scheduleNotification(task: TaskItem) {
  if (!task.notifyAt) return;
  try {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return;
    const notifId = getNotifId(task.id);
    await cancelTaskNotifications(task.id);
    const notifications: { id: number; title: string; body: string; schedule: { at: Date; allowWhileIdle: boolean }; channelId: string }[] = [];
    if (task.repeatDaily) {
      const base = new Date(task.notifyAt);
      for (let i = 0; i < 60; i++) {
        const d = new Date(base);
        d.setDate(d.getDate() + i);
        if (d > new Date()) {
          notifications.push({
            id: notifId + i,
            title: 'Дело: ' + task.text,
            body: task.details || task.text,
            schedule: { at: d, allowWhileIdle: true },
            channelId: 'tasks',
          });
        }
      }
    } else {
      notifications.push({
        id: notifId,
        title: 'Дело: ' + task.text,
        body: task.details || task.text,
        schedule: { at: new Date(task.notifyAt), allowWhileIdle: true },
        channelId: 'tasks',
      });
    }
    if (notifications.length) await LocalNotifications.schedule({ notifications });
  } catch { /* notification error ignored */ }
}

// Create notification channel for Android 8+ — must exist before scheduling
async function ensureNotificationChannel() {
  try {
    await LocalNotifications.createChannel({
      id: 'tasks',
      name: 'Дела',
      description: 'Напоминания о делах',
      importance: 5, // IMPORTANCE_HIGH — appear as heads-up + sound
      visibility: 1, // VISIBILITY_PUBLIC
      sound: undefined,
      vibration: true,
      lights: true,
    });
  } catch (e) { /* not on android or already exists */ }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Tasks() {
  const showToast = useToastStore((s) => s.showToast);
  const [store, setStore] = useState<TasksStore>(() => loadStore());
  const update = useCallback((next: TasksStore) => { setStore(next); saveStore(next); }, []);

  // ── Active category tab — persisted across tab switches
  const [activeCatId, setActiveCatId] = useState<CategoryId>(() => {
    try {
      const saved = sessionStorage.getItem('tasks_activeCatId');
      if (saved) return saved;
    } catch {}
    return loadStore().categories[0]?.id ?? 'daily';
  });

  useEffect(() => {
    try { sessionStorage.setItem('tasks_activeCatId', activeCatId); } catch {}
  }, [activeCatId]);

  // ── Category menu/rename/add
  const [catMenuId, setCatMenuId] = useState<string | null>(null);
  const [catMenuPos, setCatMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [showCatEmojiPicker, setShowCatEmojiPicker] = useState(false);
  const [catEmojiPickerPos, setCatEmojiPickerPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatEmoji, setNewCatEmoji] = useState('');
  const catEmojiPickerRef = useRef<HTMLDivElement>(null);

  // ── Level label picker (color + emoji)
  const [levelLabelId, setLevelLabelId] = useState<LevelId | null>(null);
  const [levelLabelEmoji, setLevelLabelEmoji] = useState('');
  const [showLevelEmojiGrid, setShowLevelEmojiGrid] = useState(false);
  // ── Level menu/rename/move/add
  const [levelMenuId, setLevelMenuId] = useState<string | null>(null);
  const [levelMenuPos, setLevelMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [editingLevelId, setEditingLevelId] = useState<string | null>(null);
  const [editingLevelName, setEditingLevelName] = useState('');
  const [showLevelEmojiPicker, setShowLevelEmojiPicker] = useState(false);
  const [levelEmojiPickerPos, setLevelEmojiPickerPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [moveLevelPickerId, setMoveLevelPickerId] = useState<string | null>(null);
  const [addingLevel, setAddingLevel] = useState<string | null>(null);
  const [newLevelName, setNewLevelName] = useState('');
  const [newLevelColor, setNewLevelColor] = useState('bg-neon-purple');
  const [newLevelEmoji, setNewLevelEmoji] = useState('');
  const [showNewLevelEmojiGrid, setShowNewLevelEmojiGrid] = useState(false);
  const levelEmojiPickerRef = useRef<HTMLDivElement>(null);

  const commonEmojis = useMemo<string[]>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem('custom_emoji_set');
        if (saved) return JSON.parse(saved);
      }
    } catch {}
    return ['⭐', '🔥', '💎', '🎯', '📚', '🎓', '✨', '🚀', '💪', '🏆', '📌', '🔔', '🎨', '🎵', '🌟', '💯', '👍', '❤️', '🔥', '✅'];
  }, []);

  // ── Task add form
  const [addingInLevel, setAddingInLevel] = useState<LevelId | null>(null);
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskDetails, setNewTaskDetails] = useState('');
  const [newTaskNotifyAt, setNewTaskNotifyAt] = useState('');
  const [newTaskRepeat, setNewTaskRepeat] = useState(false);

  // ── Task menu / expand / edit / copy / move
  const [taskMenuId, setTaskMenuId] = useState<string | null>(null);
  const [taskMenuPos, setTaskMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  // edit modal
  const [editModal, setEditModal] = useState<TaskItem | null>(null);
  const [editText, setEditText] = useState('');
  const [editDetails, setEditDetails] = useState('');
  // copy/move picker
  const [copyPickerId, setCopyPickerId] = useState<string | null>(null);
  const [movePickerId, setMovePickerId] = useState<string | null>(null);
  // notify picker inside context menu
  const [notifyMenuTaskId, setNotifyMenuTaskId] = useState<string | null>(null);
  const [notifyMenuDate, setNotifyMenuDate] = useState('');

  // ── Initialize notification channel and request permissions on mount
  useEffect(() => {
    (async () => {
      await ensureNotificationChannel();
      try {
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') {
          await LocalNotifications.requestPermissions();
        }
      } catch (e) { /* not on native */ }
    })();
  }, []);

  // ── Reset menus/pickers when switching categories (do NOT reset add forms)
  useEffect(() => {
    setEditingCatId(null);
    setCatMenuId(null);
    setCatMenuPos(null);
    setLevelMenuId(null);
    setTaskMenuId(null);
    setCopyPickerId(null);
    setMovePickerId(null);
    setNotifyMenuTaskId(null);
    setNotifyMenuDate('');
  }, [activeCatId]);

  // ── Drag refs (tasks)
  const dragRef = useRef<string | null>(null);
  const dragOverRef = useRef<string | null>(null);

  // ── Drag refs (levels)
  const dragLevelRef = useRef<string | null>(null);
  const dragLevelOverRef = useRef<string | null>(null);
  const [draggingLevelId, setDraggingLevelId] = useState<string | null>(null);

  // ── Drag refs (categories)
  const dragCatRef = useRef<string | null>(null);
  const dragCatOverRef = useRef<string | null>(null);
  const [draggingCatId, setDraggingCatId] = useState<string | null>(null);
  const [dragModeCats, setDragModeCats] = useState(false);

  // ── Close menus on outside click
  useEffect(() => {
    const h = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-menu]')) {
        setCatMenuId(null); setCatMenuPos(null); setLevelMenuId(null); setTaskMenuId(null);
        setCopyPickerId(null); setMovePickerId(null); setLevelLabelId(null);
      }
    };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, []);

  // ── Computed (for currently active category — used outside slides)
  const activeCat = store.categories.find((c) => c.id === activeCatId) ?? store.categories[0];
  const catLevels = store.levels.filter((l) => l.categoryId === activeCatId);
  const catTasks = store.tasks.filter((t) => t.categoryId === activeCatId);
  const totalDone = catTasks.filter((t) => t.done).length;
  const pct = catTasks.length ? Math.round((totalDone / catTasks.length) * 100) : 0;

  // ── Actions: categories
  const handleSaveCatRename = () => {
    setShowCatEmojiPicker(false);
    if (!editingCatId || !editingCatName.trim()) { setEditingCatId(null); return; }
    update({ ...store, categories: store.categories.map((c) => c.id === editingCatId ? { ...c, name: editingCatName.trim() } : c) });
    setEditingCatId(null);
  };
  const handleDeleteCat = (id: string) => {
    if (store.categories.length <= 1) { showToast('Нельзя удалить последний раздел', 'error'); return; }
    update({ ...store, categories: store.categories.filter((c) => c.id !== id), levels: store.levels.filter((l) => l.categoryId !== id), tasks: store.tasks.filter((t) => t.categoryId !== id) });
    if (activeCatId === id) setActiveCatId(store.categories.find((c) => c.id !== id)?.id ?? '');
    setCatMenuId(null);
  };
  const handleAddCat = () => {
    const name = (newCatEmoji + newCatName).trim();
    if (!name) return;
    const id = uid();
    const levelId = uid();
    update({
      ...store,
      categories: [...store.categories, { id, name }],
      levels: [...store.levels, { id: levelId, name: '1 уровень', categoryId: id, color: 'bg-neon-purple' }],
    });
    setActiveCatId(id);
    setNewCatName(''); setNewCatEmoji(''); setAddingCat(false);
  };
  const handleMoveCatLeft = (id: string) => {
    const idx = store.categories.findIndex((c) => c.id === id);
    if (idx <= 0) return;
    const arr = [...store.categories];
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    update({ ...store, categories: arr });
  };
  const handleMoveCatRight = (id: string) => {
    const idx = store.categories.findIndex((c) => c.id === id);
    if (idx < 0 || idx >= store.categories.length - 1) return;
    const arr = [...store.categories];
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    update({ ...store, categories: arr });
  };

  // ── Actions: levels
  const handleAddLevel = () => {
    const name = newLevelName.trim();
    if (!name || !addingLevel) return;
    const id = uid();
    update({ ...store, levels: [...store.levels, { id, name, categoryId: addingLevel, color: newLevelColor, emoji: newLevelEmoji || undefined }] });
    setAddingLevel(null);
    setNewLevelName('');
    setNewLevelColor('bg-neon-purple');
    setNewLevelEmoji('');
    setShowNewLevelEmojiGrid(false);
  };
  const handleCancelAddLevel = () => {
    setAddingLevel(null);
    setNewLevelName('');
    setNewLevelColor('bg-neon-purple');
    setNewLevelEmoji('');
    setShowNewLevelEmojiGrid(false);
  };
  const handleSaveLevelRename = () => {
    if (!editingLevelId || !editingLevelName.trim()) { setEditingLevelId(null); return; }
    update({ ...store, levels: store.levels.map((l) => l.id === editingLevelId ? { ...l, name: editingLevelName.trim() } : l) });
    setEditingLevelId(null);
  };
  const handleDeleteLevel = (id: LevelId) => {
    update({ ...store, levels: store.levels.filter((l) => l.id !== id), tasks: store.tasks.filter((t) => t.levelId !== id) });
    setLevelMenuId(null);
  };
  const handleSetLevelColor = (levelId: LevelId, cls: string) => {
    update({ ...store, levels: store.levels.map((l) => l.id === levelId ? { ...l, color: cls } : l) });
  };
  const handleSetLevelEmoji = (levelId: LevelId, emoji: string) => {
    update({ ...store, levels: store.levels.map((l) => l.id === levelId ? { ...l, emoji } : l) });
    setLevelLabelEmoji('');
    setLevelLabelId(null);
  };

  // ── Actions: tasks
  const handleAddTask = (levelId: LevelId) => {
    const text = newTaskText.trim();
    if (!text) return;
    const level = store.levels.find((l) => l.id === levelId);
    const categoryId = level?.categoryId ?? activeCatId;
    const task: TaskItem = { id: uid(), text, details: newTaskDetails.trim() || undefined, done: false, notifyAt: newTaskNotifyAt || undefined, repeatDaily: newTaskRepeat, levelId, categoryId };
    update({ ...store, tasks: [...store.tasks, task] });
    if (task.notifyAt) scheduleNotification(task);
    setNewTaskText(''); setNewTaskDetails(''); setNewTaskNotifyAt(''); setNewTaskRepeat(false); setAddingInLevel(null);
  };
  const handleToggleTask = (id: string) => {
    update({ ...store, tasks: store.tasks.map((t) => t.id === id ? { ...t, done: !t.done } : t) });
  };
  const handleDeleteTask = (id: string) => {
    const task = store.tasks.find((t) => t.id === id);
    if (task?.notifyAt) cancelTaskNotifications(task.id);
    update({ ...store, tasks: store.tasks.filter((t) => t.id !== id) });
    setTaskMenuId(null);
  };
  const handleSaveEdit = () => {
    if (!editModal) return;
    const updated: TaskItem = {
      ...editModal,
      text: editText.trim() || editModal.text,
      details: editDetails.trim() || undefined,
      notifyAt: editModal.notifyAt,
      repeatDaily: editModal.repeatDaily,
    };
    const next = { ...store, tasks: store.tasks.map((t) => t.id === editModal.id ? updated : t) };
    update(next);
    if (updated.notifyAt) scheduleNotification(updated);
    setEditModal(null);
  };
  const handleCopyTaskTo = (task: TaskItem, targetCatId: CategoryId, targetLevelId: LevelId) => {
    update({ ...store, tasks: [...store.tasks, { ...task, id: uid(), done: false, categoryId: targetCatId, levelId: targetLevelId }] });
    setCopyPickerId(null); setTaskMenuId(null);
    showToast('Скопировано', 'success');
  };
  const handleMoveTaskTo = (taskId: string, targetCatId: CategoryId, targetLevelId: LevelId) => {
    update({ ...store, tasks: store.tasks.map((t) => t.id === taskId ? { ...t, categoryId: targetCatId, levelId: targetLevelId } : t) });
    setMovePickerId(null); setTaskMenuId(null);
    showToast('Перенесено', 'success');
  };
  const handleSetTaskNotify = (taskId: string, notifyAt: string, repeat: boolean) => {
    const updated = store.tasks.map((t) => t.id === taskId ? { ...t, notifyAt: notifyAt || undefined, repeatDaily: notifyAt ? repeat : false } : t);
    update({ ...store, tasks: updated });
    const task = updated.find((t) => t.id === taskId);
    if (task?.notifyAt) scheduleNotification(task);
    else if (!notifyAt) cancelTaskNotifications(taskId);
    showToast(repeat && notifyAt ? 'Ежедневное уведомление настроено' : notifyAt ? 'Уведомление настроено' : 'Уведомление убрано', 'success');
  };

  // ── Drag handlers
  const handleDragStart = (id: string) => { dragRef.current = id; };
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (!dragRef.current || dragRef.current === id) return;
    const arr = [...store.tasks];
    const fi = arr.findIndex((t) => t.id === dragRef.current);
    const ti = arr.findIndex((t) => t.id === id);
    if (fi < 0 || ti < 0) return;
    const [item] = arr.splice(fi, 1);
    arr.splice(ti, 0, item);
    update({ ...store, tasks: arr });
  };
  const handleTouchStart = (id: string) => { dragRef.current = id; };
  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const row = el?.closest('[data-tid]') as HTMLElement | null;
    if (!row) return;
    const overId = row.dataset.tid;
    if (!overId || overId === dragRef.current || overId === dragOverRef.current) return;
    dragOverRef.current = overId;
    const dragged = dragRef.current;
    if (!dragged) return;
    const arr = [...store.tasks];
    const fi = arr.findIndex((t) => t.id === dragged);
    const ti = arr.findIndex((t) => t.id === overId);
    if (fi < 0 || ti < 0) return;
    const [item] = arr.splice(fi, 1);
    arr.splice(ti, 0, item);
    update({ ...store, tasks: arr });
  };
  const handleTouchEnd = () => { dragRef.current = null; dragOverRef.current = null; };

  // ── Category drag handlers (only active in dragModeCats)
  const [catDragOverId, setCatDragOverId] = useState<string | null>(null);
  const catTouchStartY = useRef(0);
  const catIsDragging = useRef(false);

  const handleCatDragStart = (id: string) => { dragCatRef.current = id; setDraggingCatId(id); };
  const handleCatDragOver = (e: React.DragEvent, id: string) => {
    if (!dragModeCats) return;
    e.preventDefault();
    setCatDragOverId(id);
    // Don't reorder immediately - just highlight the target
    // Reordering will happen on drag end
  };
  const handleCatDragLeave = () => setCatDragOverId(null);
  const handleCatDragEnd = () => {
    // Reorder categories on drag end if we have a valid target
    if (dragCatRef.current && catDragOverId && dragCatRef.current !== catDragOverId) {
      const arr = [...store.categories];
      const fi = arr.findIndex((c) => c.id === dragCatRef.current);
      const ti = arr.findIndex((c) => c.id === catDragOverId);
      if (fi >= 0 && ti >= 0) {
        const [item] = arr.splice(fi, 1);
        arr.splice(ti, 0, item);
        update({ ...store, categories: arr });
      }
    }
    dragCatRef.current = null;
    setDraggingCatId(null);
    setCatDragOverId(null);
    setDragModeCats(false);
  };

  // ── Touch handlers with scroll detection (cancel drag on vertical scroll)
  const handleCatTouchStart = (id: string, e: React.TouchEvent) => {
    if (!dragModeCats) return;
    const touch = e.touches[0];
    catTouchStartY.current = touch.clientY;
    catIsDragging.current = true;
    dragCatRef.current = id;
    setDraggingCatId(id);
  };
  const handleCatTouchMove = (e: React.TouchEvent) => {
    if (!dragModeCats || !catIsDragging.current) return;
    const touch = e.touches[0];
    const deltaY = Math.abs(touch.clientY - catTouchStartY.current);
    // Cancel drag if user scrolled down more than 10px (vertical scroll intent)
    if (deltaY > 10) {
      catIsDragging.current = false;
      dragCatRef.current = null;
      setDraggingCatId(null);
      setCatDragOverId(null);
      setDragModeCats(false);
      return;
    }
    // Find element under touch to highlight target only (no immediate reorder)
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const tabEl = el?.closest('[data-tabid]') as HTMLElement | null;
    if (tabEl) {
      const overId = tabEl.dataset.tabid;
      if (overId && overId !== dragCatRef.current) {
        setCatDragOverId(overId);
      }
    }
  };
  const handleCatTouchEnd = () => {
    // Reorder on touch end if we have a valid target
    if (dragCatRef.current && catDragOverId && dragCatRef.current !== catDragOverId) {
      const arr = [...store.categories];
      const fi = arr.findIndex((c) => c.id === dragCatRef.current);
      const ti = arr.findIndex((c) => c.id === catDragOverId);
      if (fi >= 0 && ti >= 0) {
        const [item] = arr.splice(fi, 1);
        arr.splice(ti, 0, item);
        update({ ...store, categories: arr });
      }
    }
    catIsDragging.current = false;
    dragCatRef.current = null;
    setDraggingCatId(null);
    setCatDragOverId(null);
    setDragModeCats(false);
  };

  // ── Picker: list of all cat→level destinations (excluding current)
  const allDestinations = store.categories.flatMap((cat) =>
    store.levels.filter((l) => l.categoryId === cat.id).map((l) => ({ cat, level: l }))
  );

  const menuStyle = { background: 'rgba(15,8,35,0.98)', backdropFilter: 'blur(12px)' };

  const swipeTabs = useMemo(() => store.categories.map((c) => ({ id: c.id, label: c.name })), [store.categories]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Done button for drag mode ── */}
      {dragModeCats && (
        <button
          onClick={() => setDragModeCats(false)}
          className="fixed bottom-20 right-4 z-50 px-4 py-2 text-sm font-medium bg-neon-purple text-white rounded-full shadow-lg hover:bg-neon-purple/80 transition-colors"
        >
          Готово
        </button>
      )}
      {/* ── SwipeTabs wraps categories + their content ── */}
      <SwipeTabs
        directSwipe
        tabs={swipeTabs}
        activeId={activeCatId}
        onTabChange={(id) => {
          // Cancel drag mode when switching tabs
          if (dragModeCats && id !== activeCatId) {
            setDragModeCats(false);
            setDraggingCatId(null);
          }
          setActiveCatId(id);
        }}
        onTabMenu={(id, rect) => {
          setCatMenuPos({ x: rect.left, y: rect.bottom + 4 });
          setCatMenuId(id);
        }}
        dragMode={dragModeCats}
        wobble={true}
        onCatDragStart={handleCatDragStart}
        onCatDragOver={handleCatDragOver}
        onCatDragEnd={handleCatDragEnd}
        onCatTouchStart={handleCatTouchStart}
        onCatTouchMove={handleCatTouchMove}
        onCatTouchEnd={handleCatTouchEnd}
      >
        {store.categories.map((cat) => {
          const catLevelsSlide = store.levels.filter((l) => l.categoryId === cat.id);
          const catTasksSlide = store.tasks.filter((t) => t.categoryId === cat.id);
          const totalDoneSlide = catTasksSlide.filter((t) => t.done).length;
          const pctSlide = catTasksSlide.length ? Math.round((totalDoneSlide / catTasksSlide.length) * 100) : 0;
          return (
            <div key={cat.id} className="flex flex-col h-full">
              {/* Progress bar */}
              <div className="flex items-center gap-2 px-3 py-2 glass-medium border-b border-white/5 shrink-0 overflow-hidden">
                {addingCat && activeCatId === cat.id ? (
                  /* When adding — show full-width input row, hide progress */
                  <div className="flex items-center gap-1.5 w-full min-w-0">
                    <input
                      autoFocus
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddCat(); if (e.key === 'Escape') { setNewCatName(''); setNewCatEmoji(''); setAddingCat(false); } }}
                      onBlur={(e) => { if (!e.relatedTarget) { setNewCatName(''); setNewCatEmoji(''); setAddingCat(false); } }}
                      placeholder="Название раздела"
                      className="flex-1 min-w-0 text-xs bg-transparent outline-none border-b border-neon-purple/60 px-1 py-0.5"
                    />
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setCatEmojiPickerPos({ x: r.left, y: r.bottom + 4 });
                        setShowCatEmojiPicker(!showCatEmojiPicker);
                      }}
                      className="px-1.5 py-0.5 rounded bg-white/5 text-white/60 hover:bg-white/10 text-xs shrink-0"
                    >{newCatEmoji || '😊'}</button>
                    <button onMouseDown={(e) => e.preventDefault()} onClick={handleAddCat} className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 shrink-0">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onMouseDown={(e) => e.preventDefault()} onClick={() => { setNewCatName(''); setNewCatEmoji(''); setAddingCat(false); }} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 text-white/60 hover:bg-white/10 shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  /* Normal state — progress bar + add button */
                  <>
                    <span className="text-[10px] text-white/40 shrink-0">{totalDoneSlide}/{catTasksSlide.length}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full bg-neon-purple transition-all duration-300" style={{ width: `${pctSlide}%` }} />
                    </div>
                    <span className="text-[10px] text-white/40 shrink-0">{pctSlide}%</span>
                    {activeCatId === cat.id && (
                      <button onClick={() => setAddingCat(true)} className="text-neon-purple/60 hover:text-neon-purple text-base font-bold leading-none px-1 shrink-0">+</button>
                    )}
                  </>
                )}
              </div>
              {/* Category rename editor */}
              {editingCatId === cat.id && (
                <div className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border-b border-white/10 shrink-0 overflow-hidden">
                  <input
                    autoFocus
                    value={editingCatName}
                    onChange={(e) => setEditingCatName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveCatRename();
                      if (e.key === 'Escape') setEditingCatId(null);
                      e.stopPropagation();
                    }}
                    onBlur={(e) => { if (!e.relatedTarget) setEditingCatId(null); }}
                    placeholder="Название раздела"
                    className="flex-1 min-w-0 text-xs bg-transparent outline-none border-b border-neon-purple/60 px-1 py-0.5"
                  />
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setCatEmojiPickerPos({ x: r.left, y: r.bottom + 4 });
                      setShowCatEmojiPicker(!showCatEmojiPicker);
                    }}
                    className="px-1.5 py-0.5 rounded bg-white/5 text-white/60 hover:bg-white/10 text-xs shrink-0"
                  >😊</button>
                  <button onMouseDown={(e) => e.preventDefault()} onClick={handleSaveCatRename} className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 shrink-0">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onMouseDown={(e) => e.preventDefault()} onClick={() => setEditingCatId(null)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 text-white/60 hover:bg-white/10 shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {/* Levels + tasks scroll area */}
              <div className="flex-1 overflow-y-auto px-3 pb-4 pt-3 space-y-4">

        {catLevelsSlide.map((level) => {
          const levelTasks = catTasksSlide.filter((t) => t.levelId === level.id);
          const doneCount = levelTasks.filter((t) => t.done).length;
          const levelColor = level.color ?? 'bg-neon-purple';
          return (
            <div
              key={level.id}
              onDragOver={(e) => { e.preventDefault(); dragLevelOverRef.current = level.id; }}
              onDrop={() => {
                const from = dragLevelRef.current;
                const to = dragLevelOverRef.current;
                if (from && to && from !== to) {
                  const levels = [...store.levels];
                  const fromIdx = levels.findIndex((l) => l.id === from);
                  const toIdx = levels.findIndex((l) => l.id === to);
                  if (fromIdx !== -1 && toIdx !== -1) {
                    const [item] = levels.splice(fromIdx, 1);
                    levels.splice(toIdx, 0, item);
                    update({ ...store, levels });
                  }
                }
                dragLevelRef.current = null;
                dragLevelOverRef.current = null;
                setDraggingLevelId(null);
              }}
              className={`space-y-2 transition-opacity ${draggingLevelId === level.id ? 'opacity-40' : 'opacity-100'}`}
            >
              {/* Level header */}
              <div className="flex items-center gap-2">
                {/* Drag handle */}
                <div
                  data-level-grip
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    dragLevelRef.current = level.id;
                    setDraggingLevelId(level.id);
                  }}
                  onDragEnd={() => {
                    dragLevelRef.current = null;
                    dragLevelOverRef.current = null;
                    setDraggingLevelId(null);
                  }}
                  className="cursor-grab active:cursor-grabbing text-white/20 hover:text-white/60 flex-shrink-0 p-0.5"
                  title="Перетащить"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </div>
                {/* Color/emoji label dot */}
                <div className="relative flex-shrink-0" data-menu>
                  <button data-menu 
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setLevelLabelId(levelLabelId === level.id ? null : level.id);
                      setLevelLabelEmoji('');
                    }}
                    className={`w-7 h-7 rounded-full ${levelColor} flex items-center justify-center text-[10px] flex-shrink-0 cursor-pointer hover:scale-110 transition-transform active:scale-95`}
                    title="Изменить цвет и эмодзи">
                    {level.emoji || ''}
                  </button>
                  {levelLabelId === level.id && (
                    <div data-menu className="absolute z-[9999] rounded-xl shadow-2xl border border-white/20 p-2 space-y-2 w-52 left-0 top-9"
                      style={{ ...menuStyle }} onClick={(e) => e.stopPropagation()}>
                      <p className="text-[10px] text-white/40 px-1">Цвет</p>
                      <div className="flex flex-wrap gap-1.5">
                        {LEVEL_COLORS.map((c) => (
                          <button key={c.cls} onClick={() => handleSetLevelColor(level.id, c.cls)}
                            className={`w-6 h-6 rounded-full ${c.cls} border-2 transition-all ${levelColor === c.cls ? 'border-white scale-110' : 'border-transparent'}`} />
                        ))}
                      </div>
                      <p className="text-[10px] text-white/40 px-1">Эмодзи / буква</p>
                      <div className="flex flex-col gap-1">
                        <input value={levelLabelEmoji} onChange={(e) => setLevelLabelEmoji(e.target.value.slice(0, 2))}
                          placeholder="A или 🔥" className="w-full px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs focus:outline-none focus:border-neon-purple" />
                        <div className="flex gap-1">
                          <button
                            onClick={() => setShowLevelEmojiGrid((v) => !v)}
                            className={`px-2 py-1 rounded-lg text-base transition-colors ${showLevelEmojiGrid ? 'bg-neon-purple/30 text-white' : 'bg-white/5 hover:bg-white/10'}`}
                            title="Выбрать эмодзи">😊</button>
                          <button onClick={() => handleSetLevelEmoji(level.id, levelLabelEmoji)}
                            className="flex-1 px-2 py-1 rounded-lg bg-neon-purple text-xs font-medium">OK</button>
                          {level.emoji && <button onClick={() => handleSetLevelEmoji(level.id, '')} className="px-2 py-1 rounded-lg bg-white/5 text-xs">✕</button>}
                        </div>
                        {showLevelEmojiGrid && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {commonEmojis.map((em) => (
                              <button key={em} onClick={() => { setLevelLabelEmoji(em); handleSetLevelEmoji(level.id, em); setShowLevelEmojiGrid(false); }}
                                className="w-7 h-7 flex items-center justify-center text-base hover:bg-white/10 rounded transition-colors">
                                {em}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {editingLevelId === level.id ? (
                  <div className="flex items-center gap-1 flex-1 relative">
                    <input autoFocus value={editingLevelName} onChange={(e) => setEditingLevelName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveLevelRename(); if (e.key === 'Escape') setEditingLevelId(null); }}
                      className="flex-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-neon-purple" />
                    <button
                      onClick={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setLevelEmojiPickerPos({ x: rect.left, y: rect.bottom + 4 });
                        setShowLevelEmojiPicker(!showLevelEmojiPicker);
                      }}
                      className="px-1.5 py-1 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 text-sm"
                    >
                      😊
                    </button>
                    {showLevelEmojiPicker && (
                      <div
                        ref={levelEmojiPickerRef}
                        className="fixed bg-dark-800 border border-white/10 rounded-lg p-2 grid grid-cols-5 gap-1 z-[9999] shadow-xl"
                        style={{
                          top: levelEmojiPickerPos.y,
                          left: Math.max(4, Math.min(levelEmojiPickerPos.x, (typeof window !== 'undefined' ? window.innerWidth : 375) - 220)),
                        }}
                      >
                        {commonEmojis.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => setEditingLevelName(editingLevelName + emoji)}
                            className="w-8 h-8 flex items-center justify-center text-lg hover:bg-white/10 rounded"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                    <button onClick={handleSaveLevelRename} className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-xs font-medium">Сохранить</button>
                    <button onClick={() => setEditingLevelId(null)} className="px-2.5 py-1 rounded bg-white/5 text-white/60 hover:bg-white/10 text-xs font-medium">Отмена</button>
                  </div>
                ) : (
                  <>
                    <span className="text-sm font-semibold text-white/80 flex-1">{level.name}</span>
                    <span className="text-[10px] text-white/30">{doneCount}/{levelTasks.length}</span>
                    <div data-menu className="relative">
                      <button data-menu
                        onClick={(e) => {
                          e.stopPropagation();
                          if (levelMenuId === level.id) { setLevelMenuId(null); return; }
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setLevelMenuPos({ x: rect.left, y: rect.bottom + 4 });
                          setLevelMenuId(level.id);
                        }}
                        className="opacity-50 hover:opacity-90 p-2 rounded pointer-events-auto select-none"
                        style={{ touchAction: 'manipulation' }}>
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Move level to category picker */}
              {moveLevelPickerId === level.id && (
                <div className="ml-6 p-2 rounded-lg bg-white/5 border border-white/10 space-y-1" data-menu onClick={(e) => e.stopPropagation()}>
                  <p className="text-[10px] text-white/40 pb-0.5">Перенести уровень в раздел:</p>
                  {store.categories.filter((c) => c.id !== level.categoryId).map((c) => (
                    <button key={c.id}
                      onClick={() => {
                        const updatedLevels = store.levels.map((l) =>
                          l.id === level.id ? { ...l, categoryId: c.id } : l
                        );
                        const updatedTasks = store.tasks.map((t) =>
                          t.levelId === level.id ? { ...t, categoryId: c.id } : t
                        );
                        update({ ...store, levels: updatedLevels, tasks: updatedTasks });
                        setMoveLevelPickerId(null);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded text-xs text-white hover:bg-neon-purple/20 transition-colors">
                      {c.name}
                    </button>
                  ))}
                  <button onClick={() => setMoveLevelPickerId(null)} className="text-[10px] text-white/30 w-full text-right pt-0.5">Отмена</button>
                </div>
              )}

              {/* Tasks */}
              {levelTasks.map((task) => (
                <div key={task.id} data-tid={task.id}
                  draggable onDragStart={() => handleDragStart(task.id)} onDragOver={(e) => handleDragOver(e, task.id)}
                  onTouchStart={() => handleTouchStart(task.id)} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
                  className={`glass rounded-xl px-3 py-2.5 border-l-2 transition-opacity ${task.done ? 'border-emerald-500/50 opacity-55' : `border-l-2`}`}
                  style={{ borderLeftColor: task.done ? undefined : (LEVEL_COLOR_HEX[level.color ?? ''] ?? '#a855f7') }}
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-3.5 h-3.5 text-white/20 shrink-0 cursor-grab" />
                    <button onClick={() => handleToggleTask(task.id)}
                      className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ${task.done ? 'bg-emerald-500 border-emerald-500' : 'border-white/30'}`}>
                      {task.done && <Check className="w-2.5 h-2.5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold leading-snug break-words ${task.done ? 'line-through text-white/30' : 'text-white'}`}>{task.text}</p>
                      {task.details && <p className={`text-[11px] mt-0.5 leading-snug break-words ${task.done ? 'text-white/20' : 'text-white/45'}`}>{task.details}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {task.notifyAt && <span title={format(new Date(task.notifyAt), 'dd.MM HH:mm')}><Bell className="w-3 h-3 text-amber-400/60" /></span>}
                      {task.repeatDaily && <span className="text-[9px] text-amber-400/60">↻</span>}
                      <button onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)} className="opacity-30 hover:opacity-70">
                        {expandedTaskId === task.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      {/* ⋯ menu */}
                      <div className="relative" data-menu>
                        <button data-menu
                          onClick={(e) => {
                            e.stopPropagation();
                            if (taskMenuId === task.id) { setTaskMenuId(null); return; }
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setTaskMenuPos({ x: rect.left, y: rect.bottom + 4 });
                            setTaskMenuId(task.id); setCopyPickerId(null); setMovePickerId(null);
                          }}
                          className="opacity-40 hover:opacity-90 p-0.5 rounded">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Copy picker */}
                  {copyPickerId === task.id && (
                    <div className="mt-2 ml-6 p-2 rounded-lg bg-white/5 border border-white/10 space-y-1" data-menu onClick={(e) => e.stopPropagation()}>
                      <p className="text-[10px] text-white/40 pb-0.5">Копировать в:</p>
                      {allDestinations.map(({ cat, level: l }) => (
                        <button key={l.id} onClick={() => handleCopyTaskTo(task, cat.id, l.id)}
                          className="w-full text-left px-2 py-1.5 rounded text-xs text-white hover:bg-neon-purple/20 transition-colors">
                          {cat.name} → {l.name}
                        </button>
                      ))}
                      <button onClick={() => setCopyPickerId(null)} className="text-[10px] text-white/30 w-full text-right pt-0.5">Отмена</button>
                    </div>
                  )}

                  {/* Move picker */}
                  {movePickerId === task.id && (
                    <div className="mt-2 ml-6 p-2 rounded-lg bg-white/5 border border-white/10 space-y-1" data-menu onClick={(e) => e.stopPropagation()}>
                      <p className="text-[10px] text-white/40 pb-0.5">Перенести в:</p>
                      {allDestinations.filter(({ level: l }) => l.id !== task.levelId).map(({ cat, level: l }) => (
                        <button key={l.id} onClick={() => handleMoveTaskTo(task.id, cat.id, l.id)}
                          className="w-full text-left px-2 py-1.5 rounded text-xs text-white hover:bg-neon-purple/20 transition-colors">
                          {cat.name} → {l.name}
                        </button>
                      ))}
                      <button onClick={() => setMovePickerId(null)} className="text-[10px] text-white/30 w-full text-right pt-0.5">Отмена</button>
                    </div>
                  )}

                  {/* Expanded: details edit + notification */}
                  {expandedTaskId === task.id && (
                    <div className="mt-2 ml-6 space-y-2">
                      <textarea defaultValue={task.details || ''}
                        onBlur={(e) => { const v = e.target.value.trim(); update({ ...store, tasks: store.tasks.map((t) => t.id === task.id ? { ...t, details: v || undefined } : t) }); }}
                        placeholder="Подробности..." rows={2}
                        className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-xs resize-none" />
                      <div className="flex items-center gap-2">
                        <Bell className="w-3 h-3 text-amber-400/60 shrink-0" />
                        <input type="datetime-local" defaultValue={task.notifyAt ? task.notifyAt.slice(0, 16) : ''}
                          onBlur={(e) => { const v = e.target.value; if (!v && task.notifyAt) handleSetTaskNotify(task.id, '', false); else if (v && v !== task.notifyAt) handleSetTaskNotify(task.id, v, task.repeatDaily ?? false); }}
                          className="flex-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-xs" />
                      </div>
                      {task.notifyAt && (
                        <div className="flex gap-1">
                          <button onClick={() => handleSetTaskNotify(task.id, task.notifyAt!, false)} className={`flex-1 px-1.5 py-0.5 rounded text-[10px] ${!task.repeatDaily ? 'bg-neon-purple text-white' : 'bg-white/5 text-white/50'}`}>Один раз</button>
                          <button onClick={() => handleSetTaskNotify(task.id, task.notifyAt!, true)} className={`flex-1 px-1.5 py-0.5 rounded text-[10px] ${task.repeatDaily ? 'bg-neon-purple text-white' : 'bg-white/5 text-white/50'}`}>Каждый день</button>
                          <button onClick={() => handleSetTaskNotify(task.id, '', false)} className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400">✕</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Add task */}
              {addingInLevel === level.id ? (
                <div className="glass rounded-xl p-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                  <input autoFocus value={newTaskText} onChange={(e) => setNewTaskText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !newTaskDetails) handleAddTask(level.id); if (e.key === 'Escape') setAddingInLevel(null); }}
                    placeholder="Название дела..."
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-sm" />
                  <textarea value={newTaskDetails} onChange={(e) => setNewTaskDetails(e.target.value)}
                    onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
                    placeholder="Подробности (необяз.)..." rows={2}
                    className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-xs resize-none overflow-hidden" />
                  <div className="flex items-center gap-2">
                    <Bell className="w-3 h-3 text-white/30 shrink-0" />
                    <input type="datetime-local" value={newTaskNotifyAt} onChange={(e) => setNewTaskNotifyAt(e.target.value)}
                      className="flex-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-xs" />
                  </div>
                  {newTaskNotifyAt && (
                    <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
                      <input type="checkbox" checked={newTaskRepeat} onChange={(e) => setNewTaskRepeat(e.target.checked)}
                        className="accent-neon-purple" />
                      Уведомлять каждый день
                    </label>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => handleAddTask(level.id)} className="flex-1 py-1.5 rounded-lg bg-neon-purple text-xs font-medium">Добавить</button>
                    <button onClick={() => { setAddingInLevel(null); setNewTaskText(''); setNewTaskDetails(''); setNewTaskNotifyAt(''); setNewTaskRepeat(false); }}
                      className="px-3 py-1.5 rounded-lg bg-white/5 text-xs"><X className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setAddingInLevel(level.id); setNewTaskText(''); setNewTaskDetails(''); setNewTaskNotifyAt(''); setNewTaskRepeat(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] text-white/30 hover:text-white/60 text-xs transition-colors border border-white/[0.06]">
                  <Plus className="w-3.5 h-3.5" /> Добавить дело
                </button>
              )}
            </div>
          );
        })}

        {/* Add level */}
        {addingLevel === cat.id ? (
          <div className="glass rounded-xl p-3 space-y-2" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={newLevelName}
              onChange={(e) => setNewLevelName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddLevel(); if (e.key === 'Escape') handleCancelAddLevel(); }}
              placeholder="Название уровня..."
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-sm"
            />
            {/* Color picker */}
            <div className="flex flex-wrap gap-1.5">
              {LEVEL_COLORS.map((c) => (
                <button
                  key={c.cls}
                  onClick={() => setNewLevelColor(c.cls)}
                  className={`w-6 h-6 rounded-full ${c.cls} border-2 transition-all ${newLevelColor === c.cls ? 'border-white scale-110' : 'border-transparent'}`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddLevel} className="flex-1 py-1.5 rounded-lg bg-neon-purple text-xs font-medium">Добавить</button>
              <button
                onClick={() => setShowNewLevelEmojiGrid((v) => !v)}
                className={`px-2 py-1.5 rounded-lg text-base transition-colors ${showNewLevelEmojiGrid ? 'bg-neon-purple/30' : 'bg-white/5 hover:bg-white/10'}`}
                title="Выбрать эмодзи">{newLevelEmoji || '😊'}</button>
              <button onClick={handleCancelAddLevel} className="px-3 py-1.5 rounded-lg bg-white/5 text-xs"><X className="w-3.5 h-3.5" /></button>
            </div>
            {showNewLevelEmojiGrid && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {commonEmojis.map((em) => (
                  <button key={em} onClick={() => { setNewLevelEmoji(em); setShowNewLevelEmojiGrid(false); }}
                    className="w-7 h-7 flex items-center justify-center text-base hover:bg-white/10 rounded transition-colors">
                    {em}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => setAddingLevel(cat.id)}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.03] hover:bg-neon-purple/10 text-neon-purple/60 hover:text-neon-purple text-xs transition-colors border border-dashed border-neon-purple/20">
            <Plus className="w-3.5 h-3.5" /> Добавить уровень
          </button>
        )}
              </div>
            </div>
          );
        })}
      </SwipeTabs>

      {/* Task context menu — fixed to escape overflow clipping */}
      {taskMenuId && (() => {
        const task = store.tasks.find((t) => t.id === taskMenuId);
        if (!task) return null;
        // Dynamic positioning: if near right edge, align menu to right
        const menuWidth = 192;
        const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 375;
        const isNearRightEdge = taskMenuPos.x > viewportWidth - menuWidth - 16;
        const leftPos = isNearRightEdge 
          ? Math.max(4, taskMenuPos.x - menuWidth + 40) // Align right edge of menu with button
          : Math.max(4, Math.min(taskMenuPos.x, viewportWidth - menuWidth - 8));
        return (
          <div data-menu
            className="fixed z-[9999] w-48 rounded-xl shadow-2xl overflow-hidden border border-white/20"
            style={{
              ...menuStyle,
              left: leftPos,
              top: taskMenuPos.y,
            }}
            onClick={(e) => e.stopPropagation()}>
            <button className="w-full text-left px-3 py-2.5 text-xs text-white hover:bg-white/10 transition-colors flex items-center gap-2"
              onClick={() => { const t = store.tasks.find((t) => t.id === taskMenuId); if(t){setEditModal(t);setEditText(t.text);setEditDetails(t.details??'');} setTaskMenuId(null); }}>
              <Edit2 className="w-3 h-3" />Редактировать
            </button>
            <button className="w-full text-left px-3 py-2.5 text-xs text-white hover:bg-white/10 transition-colors flex items-center gap-2"
              onClick={() => { setCopyPickerId(copyPickerId === taskMenuId ? null : taskMenuId); setMovePickerId(null); setTaskMenuId(null); }}>
              <Copy className="w-3 h-3" />Копировать в...
            </button>
            <button className="w-full text-left px-3 py-2.5 text-xs text-white hover:bg-white/10 transition-colors flex items-center gap-2"
              onClick={() => { setMovePickerId(movePickerId === taskMenuId ? null : taskMenuId); setCopyPickerId(null); setTaskMenuId(null); }}>
              <ArrowRight className="w-3 h-3" />Перенести в...
            </button>
            <button className="w-full text-left px-3 py-2.5 text-xs text-white hover:bg-white/10 transition-colors flex items-center gap-2"
              onClick={() => { setNotifyMenuTaskId(notifyMenuTaskId === taskMenuId ? null : taskMenuId); const t = store.tasks.find(t => t.id === taskMenuId); setNotifyMenuDate(t?.notifyAt ? t.notifyAt.slice(0,16) : ''); }}>
              <Bell className="w-3 h-3 text-amber-400" />
              {task.notifyAt ? 'Изменить уведомление' : 'Уведомление'}
              {task.notifyAt && <span className="ml-auto text-[9px] text-amber-400/70">{task.repeatDaily ? '↻' : '🔔'}</span>}
            </button>
            {notifyMenuTaskId === taskMenuId && (
              <div className="px-3 pb-2 space-y-2" data-menu>
                <input type="datetime-local" value={notifyMenuDate} onChange={(e) => setNotifyMenuDate(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-xs" />
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { label: 'Один раз', repeat: false },
                    { label: 'Каждый день', repeat: true },
                  ].map(({ label, repeat }) => (
                    <button key={label} onClick={() => {
                      if (!notifyMenuDate) return;
                      handleSetTaskNotify(taskMenuId!, notifyMenuDate, repeat);
                      setNotifyMenuTaskId(null); setTaskMenuId(null);
                    }} className="col-span-1 px-2 py-1.5 rounded-lg bg-white/10 hover:bg-neon-purple/30 text-[10px] text-white/80 transition-colors text-center">
                      {label}
                    </button>
                  ))}
                  {task.notifyAt && (
                    <button onClick={() => {
                      handleSetTaskNotify(taskMenuId!, '', false);
                      setNotifyMenuTaskId(null); setTaskMenuId(null);
                    }} className="col-span-1 px-2 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-[10px] text-red-400 transition-colors text-center">
                      Убрать
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="border-t border-white/10" />
            <button className="w-full text-left px-3 py-2.5 text-xs text-red-400 hover:bg-white/10 transition-colors flex items-center gap-2"
              onClick={() => { handleDeleteTask(taskMenuId); }}>
              <Trash2 className="w-3 h-3" />Удалить
            </button>
          </div>
        );
      })()}

      {/* Level context menu — fixed to escape overflow clipping */}
      {levelMenuId && (() => {
        const lev = store.levels.find((l) => l.id === levelMenuId);
        if (!lev) return null;
        // Dynamic positioning: if near right edge, align menu to right
        const menuWidth = 192;
        const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 375;
        const isNearRightEdge = levelMenuPos.x > viewportWidth - menuWidth - 16;
        const leftPos = isNearRightEdge 
          ? Math.max(4, levelMenuPos.x - menuWidth + 40) // Align right edge of menu with button
          : Math.max(4, Math.min(levelMenuPos.x, viewportWidth - menuWidth - 8));
        return (
          <div data-menu
            className="fixed z-[9999] w-48 rounded-xl shadow-2xl overflow-hidden border border-white/20"
            style={{
              ...menuStyle,
              left: leftPos,
              top: levelMenuPos.y,
            }}
            onClick={(e) => e.stopPropagation()}>
            <button className="w-full text-left px-3 py-2.5 text-xs text-white hover:bg-white/10 transition-colors"
              onClick={() => { setEditingLevelId(lev.id); setEditingLevelName(lev.name); setLevelMenuId(null); }}>✏️ Переименовать</button>
            <button className="w-full text-left px-3 py-2.5 text-xs text-white hover:bg-white/10 transition-colors flex items-center gap-2"
              onClick={() => { setMoveLevelPickerId(moveLevelPickerId === lev.id ? null : lev.id); setLevelMenuId(null); }}>
              <ArrowRight className="w-3 h-3" />Перенести в раздел
            </button>
            <div className="border-t border-white/10" />
            <button className="w-full text-left px-3 py-2.5 text-xs text-red-400 hover:bg-white/10 transition-colors"
              onClick={() => { handleDeleteLevel(lev.id); setLevelMenuId(null); }}>🗑 Удалить уровень</button>
          </div>
        );
      })()}

      {/* ── Edit modal ── */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setEditModal(null)}>
          <div className="w-full max-w-lg rounded-t-2xl p-4 space-y-3 border-t border-white/10"
            style={menuStyle} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Редактировать дело</h3>
              <button onClick={() => setEditModal(null)} className="text-white/30"><X className="w-4 h-4" /></button>
            </div>
            <input value={editText} onChange={(e) => setEditText(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-sm" />
            <textarea value={editDetails} onChange={(e) => setEditDetails(e.target.value)}
              onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
              placeholder="Подробности..." rows={3}
              className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-xs resize-none overflow-hidden" />
            <div className="flex items-center gap-2">
              <Bell className="w-3.5 h-3.5 text-amber-400/70 shrink-0" />
              <input type="datetime-local"
                defaultValue={editModal.notifyAt ? editModal.notifyAt.slice(0, 16) : ''}
                onChange={(e) => setEditModal({ ...editModal, notifyAt: e.target.value || undefined })}
                className="flex-1 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-xs" />
              {editModal.notifyAt && (
                <button onClick={() => setEditModal({ ...editModal, notifyAt: undefined })}
                  className="text-white/30 hover:text-white/60"><X className="w-3.5 h-3.5" /></button>
              )}
            </div>
            {editModal.notifyAt && (
              <div className="flex gap-1">
                <button onClick={() => setEditModal({ ...editModal, repeatDaily: false })} className={`flex-1 px-2 py-1 rounded text-[10px] ${!editModal.repeatDaily ? 'bg-neon-purple text-white' : 'bg-white/5 text-white/50'}`}>Один раз</button>
                <button onClick={() => setEditModal({ ...editModal, repeatDaily: true })} className={`flex-1 px-2 py-1 rounded text-[10px] ${editModal.repeatDaily ? 'bg-neon-purple text-white' : 'bg-white/5 text-white/50'}`}>Каждый день</button>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setEditModal(null)} className="flex-1 py-2 rounded-xl bg-white/5 text-xs">Отмена</button>
              <button onClick={handleSaveEdit} className="flex-1 py-2 rounded-xl bg-neon-purple text-xs font-medium">Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Category menu (fixed to avoid overflow clipping) ── */}
      {catMenuId && catMenuPos && (
        <div
          data-menu
          className="fixed z-[200] rounded-xl shadow-2xl overflow-hidden border border-white/20 flex flex-col"
          style={{ 
            ...menuStyle, 
            left: Math.max(4, Math.min(catMenuPos.x, (typeof window !== 'undefined' ? window.innerWidth : 375) - 180)),
            top: catMenuPos.y, 
            minWidth: 160 
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="px-4 py-3 text-xs text-white hover:bg-white/10 transition-colors text-left"
            onClick={() => {
              const cat = store.categories.find((c) => c.id === catMenuId);
              if (cat) { setEditingCatId(cat.id); setEditingCatName(cat.name); }
              setCatMenuId(null); setCatMenuPos(null);
            }}>✏️ Переименовать</button>
          <button className="px-4 py-3 text-xs text-white hover:bg-white/10 transition-colors text-left"
            onClick={() => { setDragModeCats(true); setCatMenuId(null); setCatMenuPos(null); setTimeout(() => setDragModeCats(false), 30000); }}>↔️ Переместить</button>
          <div className="h-px bg-white/10" />
          <button className="px-4 py-3 text-xs text-red-400 hover:bg-white/10 transition-colors text-left"
            onClick={() => { if (catMenuId) handleDeleteCat(catMenuId); setCatMenuPos(null); }}>🗑 Удалить</button>
        </div>
      )}

      {/* ── Category emoji picker ── */}
      {showCatEmojiPicker && (editingCatId || addingCat) && (
        <div
          ref={catEmojiPickerRef}
          data-menu
          className="fixed z-[9999] rounded-xl shadow-2xl border border-white/20 p-2"
          style={{ ...menuStyle, left: Math.max(4, Math.min(catEmojiPickerPos.x, (typeof window !== 'undefined' ? window.innerWidth : 375) - 220)), top: catEmojiPickerPos.y, maxWidth: 216 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-wrap gap-1">
            {commonEmojis.map((emoji, i) => (
              <button key={i} onClick={() => {
                if (editingCatId) setEditingCatName(editingCatName + emoji);
                else setNewCatEmoji((prev) => prev + emoji);
                setShowCatEmojiPicker(false);
              }}
                className="text-lg hover:bg-white/10 rounded p-0.5 transition-colors">{emoji}</button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
