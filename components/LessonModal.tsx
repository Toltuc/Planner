'use client';

import React, { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { format } from 'date-fns';
import { useAppStore } from '@/store/appStore';
import { useToastStore } from '@/store/toastStore';
import { useModalBackButton } from '@/components/BackButtonHandler';
import type { Lesson, LessonType } from '@/types';
import { SYSTEM_STUDENT_NAMES, SYSTEM_STUDENT_ID } from '@/types';

interface LessonModalProps {
  lesson?: Lesson;
  date?: string;
  time?: string;
  onClose: () => void;
}

const TIME_OPTIONS = Array.from({ length: 27 }, (_, i) => {
  const totalMin = 9 * 60 + i * 30;
  const h = Math.floor(totalMin / 60).toString().padStart(2, '0');
  const m = (totalMin % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
});

const DURATION_CHIPS = [
  { label: '30 мин', value: 30 },
  { label: '45 мин', value: 45 },
  { label: '1 час', value: 60 },
  { label: '1:30', value: 90 },
  { label: '2 часа', value: 120 },
  { label: '2:30', value: 150 },
  { label: '3 часа', value: 180 },
];

// Цвета по фото: Постоянный=жёлтый, Разовое=зелёный, Перерыв=голубой, Дела=розовый
const LESSON_TYPES: { value: LessonType; label: string; inactive: string; active: string }[] = [
  { value: 'regular',  label: 'Постоянный', inactive: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',   active: 'bg-yellow-400 text-black' },
  { value: 'one_time', label: 'Разовое',    inactive: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',  active: 'bg-orange-400 text-black' },
  { value: 'single',   label: 'Пробное',    inactive: 'bg-green-500/20 text-green-300 border border-green-500/30',     active: 'bg-green-400 text-black' },
  { value: 'break',    label: 'Перерыв',    inactive: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',        active: 'bg-cyan-400 text-black' },
  { value: 'business', label: 'Дела',       inactive: 'bg-pink-500/20 text-pink-300 border border-pink-500/30',        active: 'bg-pink-400 text-black' },
];

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

export default function LessonModal({ lesson, date, time, onClose }: LessonModalProps) {
  const { students, addLesson, updateLesson, deleteLesson, lessonColors } = useAppStore();
  const showToast = useToastStore((state) => state.showToast);
  const isEditing = !!lesson;

  // Handle back button to close modal
  useModalBackButton('lesson', true, onClose);

  const [formData, setFormData] = useState({
    studentId: lesson?.studentId || '',
    date: lesson?.date || date || format(new Date(), 'yyyy-MM-dd'),
    time: lesson?.time || time || '10:00',
    duration: lesson?.duration || 60,
    isRecurring: lesson?.isRecurring ?? true,
    lessonType: (lesson?.lessonType || 'regular') as LessonType,
    notes: lesson?.notes || '',
    description: lesson?.description || '',
    customDuration: false,
  });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isFreeSlot, setIsFreeSlot] = useState(lesson?.isFreeSlot ?? false);
  const [freeSlotReplacementId, setFreeSlotReplacementId] = useState(lesson?.freeSlotReplacementId || '');
  const [singleStudentName, setSingleStudentName] = useState(lesson?.studentName || '');
  const endTime = addMinutes(formData.time, formData.duration);
  const isSystemType = formData.lessonType === 'break' || formData.lessonType === 'business';
  const isSingleType = formData.lessonType === 'single';
  const isOneTimeType = formData.lessonType === 'one_time';

  // Sync isFreeSlot with lesson when editing
  React.useEffect(() => {
    if (lesson) {
      setIsFreeSlot(lesson.isFreeSlot ?? false);
    }
  }, [lesson?.id]);

  // Reset isFreeSlot when lesson type changes to system type
  React.useEffect(() => {
    if (isSystemType) {
      setIsFreeSlot(false);
    }
  }, [formData.lessonType, isSystemType]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();

    if (!isSystemType && !isSingleType && !isFreeSlot && !formData.studentId) {
      showToast('Выберите ученика', 'error');
      return;
    }
    if (isOneTimeType && !formData.studentId) {
      showToast('Выберите ученика', 'error');
      return;
    }
    if (isSingleType && !singleStudentName.trim()) {
      showToast('Введите имя ученика', 'error');
      return;
    }
    const student = students.find((s) => s.id === formData.studentId);
    if (!isSystemType && !isSingleType && !isFreeSlot && !student) {
      showToast('Ученик не найден', 'error');
      return;
    }

    const patch = {
      date: formData.date,
      time: formData.time,
      duration: formData.duration,
      isRecurring: formData.isRecurring,
      lessonType: formData.lessonType,
      notes: formData.notes,
      description: formData.description,
      isFreeSlot: isSystemType ? false : isFreeSlot,
      freeSlotReplacementId: isFreeSlot ? freeSlotReplacementId : undefined,
      studentId: isSystemType ? SYSTEM_STUDENT_ID : (isSingleType ? 'single-' + Date.now() : (student?.id ?? lesson?.studentId ?? '')),
      studentName: isSystemType
        ? (formData.lessonType === 'break' ? 'Перерыв' : 'Дела')
        : (isSingleType ? singleStudentName.trim() : (student?.fullName ?? lesson?.studentName ?? '')),
      status: 'scheduled' as const,
    };

    if (isEditing && lesson) {
      // Saving lesson patch
      updateLesson(lesson.id, patch);
      showToast('Урок обновлён', 'success');
    } else {
      addLesson(patch);
      showToast('Урок добавлен', 'success');
    }
    onClose();
  }, [formData, students, isEditing, lesson, isSystemType, isSingleType, isOneTimeType, isFreeSlot, freeSlotReplacementId, singleStudentName, addLesson, updateLesson, onClose, showToast]);

  const handleDelete = useCallback(() => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    if (lesson) {
      deleteLesson(lesson.id);
      showToast('Урок удалён', 'info');
      onClose();
    }
  }, [confirmDelete, lesson, deleteLesson, onClose, showToast]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center modal-overlay">
      <div className="bg-dark-800 w-full max-w-md mx-4 mb-4 sm:mb-0 rounded-2xl border border-white/10 overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <h2 className="text-base font-semibold">{isEditing ? 'Редактировать урок' : 'Новый урок'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form id="lesson-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Дата и время скрыты — задаются кликом по слоту в календаре */}

          {/* Тип занятия */}
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Тип занятия</label>
            <div className="grid grid-cols-2 gap-2">
              {LESSON_TYPES.map((type) => {
                const hex = lessonColors[type.value] || '#facc15';
                const isActive = formData.lessonType === type.value;
                return (
                  <button key={type.value} type="button"
                    onClick={() => setFormData({ ...formData, lessonType: type.value, isRecurring: type.value === 'regular' ? true : false })}
                    className="py-3 rounded-xl text-sm font-bold transition-all border-2"
                    style={isActive
                      ? { backgroundColor: hex, borderColor: hex, color: '#000' }
                      : { backgroundColor: hex + '33', borderColor: hex + '66', color: hex }
                    }>
                    {type.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Временно свободно */}
          {!isSystemType && (
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div
                  onClick={() => setIsFreeSlot(!isFreeSlot)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                    isFreeSlot ? 'bg-neon-purple border-neon-purple' : 'border-white/30 bg-white/5'
                  }`}
                >
                  {isFreeSlot && <span className="text-white text-xs font-bold leading-none">✓</span>}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm text-white/80">Временно свободно</span>
                  <span className="text-[10px] text-white/50">Ученик не придёт, время можно занять другим</span>
                </div>
              </label>
              {isFreeSlot && (
                <div>
                  <label className="block text-xs text-white/50 mb-1">Ученик на замену (необязательно)</label>
                  <select
                    value={freeSlotReplacementId}
                    onChange={(e) => setFreeSlotReplacementId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-sm"
                  >
                    <option value="">Не выбран</option>
                    {students
                      .filter((s) => !SYSTEM_STUDENT_NAMES.includes(s.fullName))
                      .sort((a, b) => a.fullName.localeCompare(b.fullName))
                      .map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Ученик для разового урока (из списка) */}
          {isOneTimeType && (
            <div>
              <label className="block text-xs text-white/50 mb-1">Ученик</label>
              <select value={formData.studentId}
                onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-sm">
                <option value="">Выберите ученика...</option>
                {students
                  .filter((s) => s.status === 'active' && !SYSTEM_STUDENT_NAMES.includes(s.fullName))
                  .sort((a, b) => a.fullName.localeCompare(b.fullName))
                  .map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
              </select>
            </div>
          )}

          {/* Ученик (только для постоянных уроков) */}
          {!isSystemType && !isSingleType && !isOneTimeType && (
            <div>
              <label className="block text-xs text-white/50 mb-1">Ученик</label>
              <select value={formData.studentId}
                onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-sm">
                <option value="">Выберите ученика...</option>
                {students
                  .filter((s) => s.status === 'active' && !SYSTEM_STUDENT_NAMES.includes(s.fullName))
                  .sort((a, b) => a.fullName.localeCompare(b.fullName))
                  .map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
              </select>
            </div>
          )}

          {/* Имя ученика для пробного занятия */}
          {isSingleType && (
            <div>
              <label className="block text-xs text-white/50 mb-1">Имя ученика</label>
              <input
                type="text"
                value={singleStudentName}
                onChange={(e) => setSingleStudentName(e.target.value)}
                placeholder="Введите имя ученика"
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-sm"
              />
            </div>
          )}

          {/* Длительность */}
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Длительность</label>
            <div className="flex flex-wrap gap-1.5">
              {DURATION_CHIPS.map((chip) => (
                <button key={chip.value} type="button"
                  onClick={() => setFormData({ ...formData, duration: chip.value, customDuration: false })}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    !formData.customDuration && formData.duration === chip.value
                      ? 'bg-neon-purple text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}>
                  {chip.label}
                </button>
              ))}
              <button type="button"
                onClick={() => setFormData({ ...formData, customDuration: true })}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  formData.customDuration ? 'bg-neon-purple text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}>
                Другое
              </button>
            </div>
            {formData.customDuration && (
              <div className="mt-2 flex items-center gap-2">
                <input type="number" value={formData.duration} min={15} max={360} step={5}
                  onChange={(e) => setFormData({ ...formData, duration: Number(e.target.value) })}
                  className="w-24 px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-sm" />
                <span className="text-xs text-white/50">мин</span>
              </div>
            )}
          </div>

          {formData.lessonType === 'business' && (
            <>
              {/* Наименование */}
              <div>
                <label className="block text-xs text-white/50 mb-1">Наименование</label>
                <textarea value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
                  placeholder="Наименование занятия..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-sm resize-none overflow-hidden" />
              </div>

              {/* Описание */}
              <div>
                <label className="block text-xs text-white/50 mb-1">Описание</label>
                <textarea value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
                  placeholder="Описание занятия..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-sm resize-none overflow-hidden" />
              </div>
            </>
          )}

        </form>

        <div className="shrink-0 border-t border-white/10 px-4 py-3 flex gap-2">
          {isEditing && !confirmDelete && (
            <button type="button" onClick={handleDelete}
              className="flex-1 py-2.5 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors text-sm font-bold">
              Удалить
            </button>
          )}
          {isEditing && confirmDelete && (
            <>
              <button type="button" onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 transition-colors text-sm">
                Нет
              </button>
              <button type="button" onClick={handleDelete}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 transition-colors text-sm font-bold text-white">
                Да, удалить
              </button>
            </>
          )}
          {!confirmDelete && (
            <button type="submit" form="lesson-form"
              className="flex-1 py-2.5 rounded-xl bg-neon-purple hover:bg-neon-purple/80 transition-colors text-sm font-medium">
              Сохранить
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
