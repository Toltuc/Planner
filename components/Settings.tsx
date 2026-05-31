'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Download, Upload, Trash2, AlertTriangle, Clock, Palette, Smile, Plus, X as XIcon, RotateCcw, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { DEFAULT_EMOJIS, EMOJI_CATEGORIES, DEFAULT_COMBOS, type EmojiCombo } from '@/lib/defaultEmojis';
import { useAppStore } from '@/store/appStore';
import { useToastStore } from '@/store/toastStore';

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

export default function Settings() {
  const { exportData, importData, workingHours, setWorkingHours, theme, setTheme, isInitialized, lessonColors, setLessonColor, resetLessonColors } = useAppStore();
  const showToast = useToastStore((state) => state.showToast);

  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);

  // Emoji combos management
  const [combos, setCombos] = useState<EmojiCombo[]>(() => {
    try {
      const saved = localStorage.getItem('emoji_combos');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_COMBOS;
  });
  const [activeComboId, setActiveComboId] = useState<string>(() => {
    try { return localStorage.getItem('active_emoji_combo') || 'achievements'; } catch { return 'achievements'; }
  });
  const [newComboName, setNewComboName] = useState('');
  const [editingComboId, setEditingComboId] = useState<string | null>(null);
  const [openCategoryIdx, setOpenCategoryIdx] = useState<number | null>(null);

  const activeCombo = combos.find(c => c.id === activeComboId) || combos[0] || { id: '', name: '', emojis: [] };

  const saveCombos = (list: EmojiCombo[]) => {
    setCombos(list);
    try { localStorage.setItem('emoji_combos', JSON.stringify(list)); } catch {}
    // sync active combo to custom_emoji_set so Students picker uses it
    const active = list.find(c => c.id === activeComboId) || list[0];
    if (active) try { localStorage.setItem('custom_emoji_set', JSON.stringify(active.emojis)); } catch {}
  };

  const setActive = (id: string) => {
    setActiveComboId(id);
    try { localStorage.setItem('active_emoji_combo', id); } catch {}
    const combo = combos.find(c => c.id === id);
    if (combo) try { localStorage.setItem('custom_emoji_set', JSON.stringify(combo.emojis)); } catch {}
  };

  const addEmojiToCombo = (comboId: string, emoji: string) => {
    saveCombos(combos.map(c => c.id === comboId && !c.emojis.includes(emoji)
      ? { ...c, emojis: [...c.emojis, emoji] } : c));
  };

  const removeEmojiFromCombo = (comboId: string, emoji: string) => {
    saveCombos(combos.map(c => c.id === comboId
      ? { ...c, emojis: c.emojis.filter(e => e !== emoji) } : c));
  };

  const createCombo = () => {
    const name = newComboName.trim();
    if (!name) return;
    const id = 'custom_' + Date.now();
    const newCombo: EmojiCombo = { id, name, emojis: [] };
    saveCombos([...combos, newCombo]);
    setActive(id);
    setNewComboName('');
    showToast(`Комбинация «${name}» создана`, 'success');
  };

  const deleteCombo = (id: string) => {
    const next = combos.filter(c => c.id !== id);
    saveCombos(next);
    if (activeComboId === id && next.length > 0) setActive(next[0].id);
    showToast('Комбинация удалена', 'info');
  };

  const resetCombos = () => {
    saveCombos(DEFAULT_COMBOS);
    setActive('achievements');
    showToast('Набор эмодзи сброшен', 'success');
  };

  const handleExport = useCallback(async () => {
    const data = exportData();
    const fileName = `guitar-planner-backup-${new Date().toISOString().split('T')[0]}.json`;

    try {
      // Check if running on Capacitor (mobile)
      if (typeof window !== 'undefined' && (window as { Capacitor?: unknown }).Capacitor) {
        const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');

        // Save to Downloads folder on Android
        await Filesystem.writeFile({
          path: `Download/${fileName}`,
          data: data,
          directory: Directory.ExternalStorage,
          encoding: Encoding.UTF8,
          recursive: true,
        });

        showToast(`Файл сохранен: ${fileName}`, 'success');
      } else {
        // Web fallback - download via browser
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Данные экспортированы', 'success');
      }
    } catch (_error) {
      showToast('Ошибка экспорта. Проверьте разрешения.', 'error');
    }
  }, [exportData, showToast]);

  // File input ref for mobile import
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      importData(text);
      showToast('Данные импортированы', 'success');
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (_error) {
      showToast('Ошибка импорта данных', 'error');
    }
  }, [importData, showToast]);

  const handleImport = useCallback(() => {
    // Trigger file input click
    fileInputRef.current?.click();
  }, []);


  const handleClearAll = useCallback(async () => {
    if (confirm('ВНИМАНИЕ! Это удалит ВСЕ данные. Продолжить?')) {
      if (confirm('Точно? Данные будут безвозвратно утеряны.')) {
        const currentTheme = useAppStore.getState().theme;

        // Clear localStorage
        localStorage.removeItem('students');
        localStorage.removeItem('lessons');
        localStorage.removeItem('dailyReports');
        localStorage.removeItem('tariffs');
        localStorage.removeItem('workingHours');
        localStorage.removeItem('theme');

        // Clear in-memory store immediately
        useAppStore.setState({
          students: [],
          lessons: [],
          dailyReports: [],
          isInitialized: false,
        });

        // Clear SQLite tables (Android)
        if (typeof window !== 'undefined' && (window as { Capacitor?: unknown }).Capacitor) {
          const sqlite = await import('@/lib/sqlite');
          sqlite.setSetting('students_cleared', true).catch(() => {});
          const { CapacitorSQLite } = await import('@capacitor-community/sqlite');
          CapacitorSQLite.deleteDatabase({ database: 'guitar_planner.db' }).catch(() => {});
        }

        showToast('Все данные очищены. Перезагрузите приложение.', 'info');
        setTimeout(() => window.location.reload(), 1000);
      }
    }
  }, [showToast]);



  // Loading state
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-neon-purple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 p-4 space-y-4 overflow-y-auto overflow-x-hidden w-full max-w-full box-border">
      <h1 className="text-lg font-semibold">Настройки</h1>

      {/* Theme */}
      <div className="glass p-4 rounded-xl space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-neon-purple" />
          <h2 className="text-sm font-medium text-white/60">Тема оформления</h2>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setTheme('neon')}
            aria-label="Тема Неон"
            className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
              theme === 'neon'
                ? 'border-[#a855f7] bg-[#a855f7]/15'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
          >
            <div className="flex gap-1">
              <span className="w-3 h-3 rounded-full bg-[#a855f7]" />
              <span className="w-3 h-3 rounded-full bg-[#3b82f6]" />
            </div>
            <span className="text-xs font-medium">Неон</span>
            {theme === 'neon' && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#a855f7]" />}
          </button>
          <button
            onClick={() => setTheme('brand')}
            aria-label="Тема Гитара"
            className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
              theme === 'brand'
                ? 'border-[#f5a623] bg-[#f5a623]/15'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
          >
            <div className="flex gap-1">
              <span className="w-3 h-3 rounded-full bg-[#f5a623]" />
              <span className="w-3 h-3 rounded-full bg-[#ff5500]" />
            </div>
            <span className="text-xs font-medium">Гитара</span>
            {theme === 'brand' && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#f5a623]" />}
          </button>
          <button
            onClick={() => setTheme('ocean')}
            aria-label="Тема Океан"
            className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
              theme === 'ocean'
                ? 'border-[#0096c7] bg-[#0096c7]/15'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
          >
            <div className="flex gap-1">
              <span className="w-3 h-3 rounded-full bg-[#0096c7]" />
              <span className="w-3 h-3 rounded-full bg-[#00b4d8]" />
            </div>
            <span className="text-xs font-medium">Океан</span>
            {theme === 'ocean' && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#0096c7]" />}
          </button>
          <button
            onClick={() => setTheme('forest')}
            aria-label="Тема Лес"
            className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
              theme === 'forest'
                ? 'border-[#2ecc71] bg-[#2ecc71]/15'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
          >
            <div className="flex gap-1">
              <span className="w-3 h-3 rounded-full bg-[#2ecc71]" />
              <span className="w-3 h-3 rounded-full bg-[#27ae60]" />
            </div>
            <span className="text-xs font-medium">Лес</span>
            {theme === 'forest' && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#2ecc71]" />}
          </button>
          <button
            onClick={() => setTheme('sunset')}
            aria-label="Тема Закат"
            className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
              theme === 'sunset'
                ? 'border-[#ff6b6b] bg-[#ff6b6b]/15'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
          >
            <div className="flex gap-1">
              <span className="w-3 h-3 rounded-full bg-[#ff6b6b]" />
              <span className="w-3 h-3 rounded-full bg-[#ff8e53]" />
            </div>
            <span className="text-xs font-medium">Закат</span>
            {theme === 'sunset' && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#ff6b6b]" />}
          </button>
          <button
            onClick={() => setTheme('midnight')}
            aria-label="Тема Полночь"
            className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
              theme === 'midnight'
                ? 'border-[#9b59b6] bg-[#9b59b6]/15'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
          >
            <div className="flex gap-1">
              <span className="w-3 h-3 rounded-full bg-[#9b59b6]" />
              <span className="w-3 h-3 rounded-full bg-[#8e44ad]" />
            </div>
            <span className="text-xs font-medium">Полночь</span>
            {theme === 'midnight' && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#9b59b6]" />}
          </button>
        </div>
      </div>

      {/* Working Hours */}
      <div className="glass p-4 rounded-xl space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-neon-cyan" />
          <h2 className="text-sm font-medium text-white/60">Рабочие часы</h2>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={workingHours.enabled}
            onChange={(e) => setWorkingHours({ ...workingHours, enabled: e.target.checked })}
            className="w-4 h-4 rounded border-white/20 bg-white/5 text-neon-purple focus:ring-neon-purple"
          />
          <span className="text-sm">Показывать только рабочие часы</span>
        </label>

        {workingHours.enabled && (
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-xs text-white/60 mb-1">Начало</label>
              <select
                value={workingHours.startHour}
                onChange={(e) => setWorkingHours({ ...workingHours, startHour: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-sm"
              >
                {Array.from({ length: 48 }, (_, i) => {
                  const val = i * 0.5;
                  const h = Math.floor(val).toString().padStart(2, '0');
                  const m = val % 1 === 0.5 ? '30' : '00';
                  return <option key={i} value={val}>{h}:{m}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">Конец</label>
              <select
                value={workingHours.endHour}
                onChange={(e) => setWorkingHours({ ...workingHours, endHour: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-sm"
              >
                {Array.from({ length: 48 }, (_, i) => {
                  const val = i * 0.5;
                  const h = Math.floor(val).toString().padStart(2, '0');
                  const m = val % 1 === 0.5 ? '30' : '00';
                  return <option key={i} value={val}>{h}:{m}</option>;
                })}
              </select>
            </div>
          </div>
        )}

        <p className="text-xs text-white/40">
          При включении в календаре будут показаны только ученики из выбранного временного диапазона
        </p>
      </div>

      {/* Lesson Type Colors */}
      <div className="glass p-4 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-neon-purple" />
            <h2 className="text-sm font-medium text-white/60">Цвета типов занятий</h2>
          </div>
          <button
            onClick={resetLessonColors}
            className="text-xs text-white/40 hover:text-white/70 transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
          >
            Сбросить
          </button>
        </div>
        <div className="space-y-2">
          {([
            { key: 'regular',  label: 'Постоянный' },
            { key: 'one_time', label: 'Разовое' },
            { key: 'single',   label: 'Пробное' },
            { key: 'break',    label: 'Перерыв' },
            { key: 'business', label: 'Дела' },
          ] as { key: string; label: string }[]).map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded border" style={{ backgroundColor: lessonColors[key], borderColor: lessonColors[key] }} />
                <span className="text-sm">{label}</span>
              </div>
              <label className="relative cursor-pointer">
                <input
                  type="color"
                  value={lessonColors[key] || '#facc15'}
                  onChange={(e) => setLessonColor(key, e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                />
                <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/60 hover:bg-white/10 transition-colors block">
                  {lessonColors[key] || '#facc15'}
                </span>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Emoji Combos */}
      <div className="glass p-4 rounded-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smile className="w-4 h-4 text-yellow-400" />
            <h2 className="text-sm font-medium text-white/60">Набор эмодзи</h2>
          </div>
          <button onClick={resetCombos} className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors px-2 py-1 rounded-lg hover:bg-white/5">
            <RotateCcw className="w-3 h-3" />
            Сбросить
          </button>
        </div>

        {/* 1. Active combo — current set */}
        <div>
          <p className="text-xs text-white/40 mb-2">Активная комбинация: <span className="text-white/70 font-medium">{activeCombo.name}</span></p>
          <div className="flex flex-wrap gap-1.5 min-h-[2.5rem] p-2 rounded-xl bg-white/5 border border-neon-purple/30">
            {activeCombo.emojis.length === 0
              ? <span className="text-xs text-white/25 py-1">Пусто — добавьте эмодзи из категорий ниже</span>
              : activeCombo.emojis.map(emoji => (
                <div key={emoji} className="relative group">
                  <div className="w-8 h-8 flex items-center justify-center text-lg rounded-lg bg-white/5 border border-white/10 select-none">{emoji}</div>
                  <button
                    onClick={() => removeEmojiFromCombo(activeCombo.id, emoji)}
                    className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  ><XIcon className="w-2 h-2" /></button>
                </div>
              ))
            }
          </div>
        </div>

        {/* 2. Saved combos */}
        <div>
          <p className="text-xs text-white/40 mb-2">Сохранённые комбинации</p>
          <div className="space-y-1.5">
            {combos.map(combo => (
              <div key={combo.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors ${
                activeComboId === combo.id ? 'bg-neon-purple/15 border-neon-purple/40' : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}>
                <button className="flex-1 text-left" onClick={() => setActive(combo.id)}>
                  <div className="flex items-center gap-2">
                    {activeComboId === combo.id && <Check className="w-3 h-3 text-neon-purple shrink-0" />}
                    <span className="text-xs font-medium">{combo.name}</span>
                    <span className="text-xs text-white/30 ml-1">{combo.emojis.slice(0, 6).join('')}{combo.emojis.length > 6 ? '…' : ''}</span>
                  </div>
                </button>
                <button
                  onClick={() => setEditingComboId(editingComboId === combo.id ? null : combo.id)}
                  className="text-xs text-white/40 hover:text-white/70 px-1.5 py-0.5 rounded hover:bg-white/10"
                >✏️</button>
                {combos.length > 1 && (
                  <button onClick={() => deleteCombo(combo.id)} className="text-xs text-red-400/60 hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-red-500/10">
                    <XIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {/* New combo */}
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={newComboName}
              onChange={e => setNewComboName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createCombo()}
              placeholder="Название новой комбинации..."
              className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-xs"
            />
            <button onClick={createCombo} className="px-3 py-2 rounded-xl bg-neon-purple/80 hover:bg-neon-purple transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 3. All emoji categories */}
        <div>
          <p className="text-xs text-white/40 mb-2">Все эмодзи по категориям — нажмите чтобы добавить в активную комбинацию</p>
          <div className="space-y-1">
            {EMOJI_CATEGORIES.map((cat, idx) => (
              <div key={idx} className="rounded-xl border border-white/10 overflow-hidden">
                <button
                  onClick={() => setOpenCategoryIdx(openCategoryIdx === idx ? null : idx)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors text-xs"
                >
                  <span>{cat.label}</span>
                  {openCategoryIdx === idx ? <ChevronUp className="w-3.5 h-3.5 text-white/40" /> : <ChevronDown className="w-3.5 h-3.5 text-white/40" />}
                </button>
                {openCategoryIdx === idx && (
                  <div className="flex flex-wrap gap-1.5 p-3 bg-white/[0.03]">
                    {cat.emojis.map(emoji => {
                      const inActive = activeCombo.emojis.includes(emoji);
                      return (
                        <button
                          key={emoji}
                          onClick={() => inActive ? removeEmojiFromCombo(activeCombo.id, emoji) : addEmojiToCombo(activeCombo.id, emoji)}
                          className={`w-8 h-8 flex items-center justify-center text-lg rounded-lg border transition-all ${
                            inActive
                              ? 'bg-neon-purple/20 border-neon-purple/50 ring-1 ring-neon-purple/30'
                              : 'bg-white/5 border-white/10 hover:bg-white/15 hover:border-white/30'
                          }`}
                          title={inActive ? 'Убрать из набора' : 'Добавить в набор'}
                        >{emoji}</button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hidden file input for mobile import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Data Management */}
      <div className="glass p-4 rounded-xl space-y-3">
        <h2 className="text-sm font-medium text-white/60">Управление данными</h2>
        
        <button
          onClick={handleExport}
          aria-label="Экспорт данных"
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
        >
          <Download className="w-5 h-5 text-neon-purple" />
          <div className="text-left">
            <p className="font-medium">Экспорт данных</p>
            <p className="text-xs text-white/60">Сохранить JSON файл</p>
          </div>
        </button>

        {/* Mobile Import - file picker */}
        <button
          onClick={handleImport}
          aria-label="Импорт данных"
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors md:hidden"
        >
          <Upload className="w-5 h-5 text-neon-blue" />
          <div className="text-left">
            <p className="font-medium">Импорт данных</p>
            <p className="text-xs text-white/60">Выбрать JSON файл</p>
          </div>
        </button>

        {/* Desktop Import - text area */}
        <button
          onClick={() => setShowImport(!showImport)}
          aria-label="Импорт данных"
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors hidden md:flex"
        >
          <Upload className="w-5 h-5 text-neon-blue" />
          <div className="text-left">
            <p className="font-medium">Импорт данных</p>
            <p className="text-xs text-white/60">Восстановить из JSON</p>
          </div>
        </button>

        {showImport && (
          <div className="space-y-2 pt-2 hidden md:block">
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Вставьте JSON данные..."
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none transition-colors text-sm min-h-[100px] resize-none"
            />
            <button
              onClick={handleImport}
              className="w-full px-4 py-2 rounded-lg bg-neon-purple hover:bg-neon-purple/80 transition-colors text-sm font-medium"
            >
              Импортировать
            </button>
          </div>
        )}

      </div>

      {/* Danger Zone */}
      <div className="glass p-4 rounded-xl border border-red-500/20">
        <h2 className="text-sm font-medium text-red-400 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Опасная зона
        </h2>
        
        <button
          onClick={handleClearAll}
          aria-label="Очистить все данные"
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 transition-colors text-red-400"
        >
          <Trash2 className="w-5 h-5" />
          <div className="text-left">
            <p className="font-medium">Очистить все данные</p>
            <p className="text-xs text-red-400/60">Безвозвратно удалить всё</p>
          </div>
        </button>
      </div>

      {/* About */}
      <div className="text-center text-xs text-white/40 pt-4">
        <p>Планер v1.0.0</p>
        <p>Built with Next.js + Capacitor</p>
      </div>
    </div>
  );
}

