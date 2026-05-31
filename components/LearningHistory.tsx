'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { BookOpen, Target, Home, ChevronLeft, Clock, Users, ChevronDown, ChevronUp, Settings2, Check, X, Send, AlertCircle } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useAppStore } from '@/store/appStore';
import { useToastStore } from '@/store/toastStore';
import type { Student, StudentNotes } from '@/types';
import { isUserLesson, SYSTEM_STUDENT_NAMES } from '@/types';

type DayKey = 'today' | 'tomorrow' | 'yesterday';

const DAY_LABELS: Record<DayKey, string> = {
  today: 'Сегодня',
  tomorrow: 'Завтра',
  yesterday: 'Вчера',
};

interface LearningHistoryProps {
  onBack: () => void;
}

export default function LearningHistory({ onBack }: LearningHistoryProps) {
  const { students, lessons } = useAppStore();

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [dayOrder, setDayOrder] = useState<DayKey[]>(['today', 'tomorrow', 'yesterday']);
  const [showOrderSettings, setShowOrderSettings] = useState(false);

  const realStudents = useMemo(
    () => students.filter((s) => !SYSTEM_STUDENT_NAMES.includes(s.fullName)),
    [students]
  );

  // Build day → students map based on order
  const dayStudents = useMemo(() => {
    const today = new Date();
    const dateMap: Record<DayKey, string> = {
      today: format(today, 'yyyy-MM-dd'),
      tomorrow: format(addDays(today, 1), 'yyyy-MM-dd'),
      yesterday: format(addDays(today, -1), 'yyyy-MM-dd'),
    };

    const result: { key: DayKey; date: string; students: Student[] }[] = dayOrder.map((key) => {
      const date = dateMap[key];
      const dayLessons = lessons
        .filter((l) => l.date === date && isUserLesson(l))
        .sort((a, b) => a.time.localeCompare(b.time));
      // Deduplicate by studentId, also handle single-type lessons (studentId = 'single-...')
      const seen = new Set<string>();
      const dayStudentList: Student[] = [];
      for (const lesson of dayLessons) {
        if (seen.has(lesson.studentId)) continue;
        seen.add(lesson.studentId);
        const found = realStudents.find((s) => s.id === lesson.studentId);
        if (found) {
          dayStudentList.push(found);
        } else if (lesson.lessonType === 'single' && lesson.studentName) {
          // Разовый ученик — создаём временный объект для отображения
          dayStudentList.push({
            id: lesson.studentId,
            fullName: lesson.studentName,
            phone: '',
            tariff: 0,
            balance: 0,
            status: 'active',
            isRecurring: false,
            notes: { progress: '', futurePlan: '', homework: '' },
            createdAt: '',
            updatedAt: '',
          });
        }
      }
      return { key, date, students: dayStudentList };
    });

    return result;
  }, [dayOrder, lessons, realStudents]);

  // All students that don't appear in any day section
  const otherStudents = useMemo(() => {
    const allDayIds = new Set(dayStudents.flatMap((d) => d.students.map((s) => s.id)));
    return realStudents.filter((s) => !allDayIds.has(s.id));
  }, [dayStudents, realStudents]);

  const getLastLesson = (studentId: string) => {
    const sl = lessons
      .filter((l) => l.studentId === studentId && isUserLesson(l))
      .sort((a, b) => (a.date + a.time > b.date + b.time ? -1 : 1));
    return sl[0] ?? null;
  };

  const moveDay = (idx: number, dir: -1 | 1) => {
    const next = [...dayOrder];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    setDayOrder(next);
  };

  if (selectedStudent) {
    return (
      <StudentNotesEditor student={selectedStudent} onBack={() => setSelectedStudent(null)} />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-x-hidden">
      {/* Header */}
      <div className="glass-medium px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold flex-1">История обучения</h1>
        <button
          onClick={() => setShowOrderSettings(!showOrderSettings)}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          title="Настройка порядка"
        >
          <Settings2 className="w-5 h-5" />
        </button>
      </div>

      {/* Order settings */}
      {showOrderSettings && (
        <div className="glass-medium mx-4 mt-2 p-3 rounded-xl space-y-2 shrink-0">
          <p className="text-xs text-white/50 mb-1">Порядок групп:</p>
          {dayOrder.map((key, idx) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm">{DAY_LABELS[key]}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => moveDay(idx, -1)}
                  disabled={idx === 0}
                  className="p-1 rounded hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => moveDay(idx, 1)}
                  disabled={idx === dayOrder.length - 1}
                  className="p-1 rounded hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Day groups */}
        {dayStudents.map(({ key, date, students: group }) => {
          const label = DAY_LABELS[key];
          const dateFmt = format(new Date(date + 'T00:00:00'), 'd MMMM', { locale: ru });
          return (
            <section key={key}>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-white/40" />
                <span className="text-xs font-semibold text-white/60 uppercase tracking-wide">
                  {label} · {dateFmt}
                </span>
              </div>
              {group.length === 0 ? (
                <p className="text-xs text-white/25 px-1">Нет уроков</p>
              ) : (
                <div className="space-y-2">
                  {group.map((s) => (
                    <StudentCard key={s.id} student={s} onClick={() => setSelectedStudent(s)} />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {/* Other students */}
        {otherStudents.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-white/40" />
              <span className="text-xs font-semibold text-white/60 uppercase tracking-wide">Остальные</span>
            </div>
            <div className="space-y-2">
              {otherStudents.map((s) => (
                <StudentCard key={s.id} student={s} onClick={() => setSelectedStudent(s)} />
              ))}
            </div>
          </section>
        )}

        {realStudents.length === 0 && (
          <div className="text-center py-12 text-white/30">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>Нет учеников</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StudentCard({ student, onClick }: { student: Student; onClick: () => void }) {
  const hasNotes = student.notes?.progress || student.notes?.futurePlan || student.notes?.homework;
  return (
    <button
      onClick={onClick}
      className="w-full glass p-3 rounded-xl text-left hover:border-neon-purple/30 transition-colors space-y-1.5"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{student.fullName}</span>
        <ChevronLeft className="w-4 h-4 text-white/30 rotate-180" />
      </div>
      {hasNotes ? (
        <div className="space-y-0.5">
          {student.notes?.progress && (
            <p className="text-xs text-white/50 flex items-center gap-1 truncate">
              <BookOpen className="w-3 h-3 shrink-0" />
              <span className="truncate">{student.notes.progress}</span>
            </p>
          )}
          {student.notes?.futurePlan && (
            <p className="text-xs text-white/50 flex items-center gap-1 truncate">
              <Target className="w-3 h-3 shrink-0" />
              <span className="truncate">{student.notes.futurePlan}</span>
            </p>
          )}
          {student.notes?.homework && (
            <p className="text-xs text-white/50 flex items-center gap-1 truncate">
              <Home className="w-3 h-3 shrink-0" />
              <span className="truncate">{student.notes.homework}</span>
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-white/30 italic">Нет записей</p>
      )}
    </button>
  );
}

function notesHash(n: StudentNotes) {
  return [n.progress, n.futurePlan, n.homework].join('|');
}

function StudentNotesEditor({ student, onBack }: { student: Student; onBack: () => void }) {
  const { updateStudent } = useAppStore();
  const showToast = useToastStore((s) => s.showToast);

  const [notes, setNotes] = useState<StudentNotes>({
    progress: student.notes?.progress || '',
    futurePlan: student.notes?.futurePlan || '',
    homework: student.notes?.homework || '',
  });
  const [dirty, setDirty] = useState(false);

  // Report state: stored in localStorage by student id
  const reportKey = `report_submitted:${student.id}`;
  const [reportSubmitted, setReportSubmitted] = useState<boolean>(() => {
    try { return localStorage.getItem(reportKey) === notesHash(student.notes || { progress: '', futurePlan: '', homework: '' }); }
    catch { return false; }
  });
  // reportNeedsSubmit = notes changed since last report submission
  const reportNeedsSubmit = dirty || !reportSubmitted;

  const update = (field: keyof StudentNotes, val: string) => {
    setNotes((p) => ({ ...p, [field]: val }));
    setDirty(true);
    setReportSubmitted(false);
  };

  const handleSave = () => {
    updateStudent(student.id, { notes });
    showToast('Сохранено', 'success');
    setDirty(false);
  };

  const handleSubmitReport = () => {
    updateStudent(student.id, { notes });
    const hash = notesHash(notes);
    try { localStorage.setItem(reportKey, hash); } catch {}
    setReportSubmitted(true);
    setDirty(false);
    showToast('Отчёт сдан!', 'success');
  };

  return (
    <div className="flex flex-col h-full overflow-x-hidden">
      <div className="glass-medium px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold flex-1 truncate">{student.fullName}</h1>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-sm"
            >
              <Check className="w-4 h-4" />
              Сохранить
            </button>
          )}
          {/* Сдать отчет button — pulses when unsent */}
          <button
            onClick={handleSubmitReport}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              reportSubmitted
                ? 'bg-emerald-500/20 text-emerald-400 cursor-default'
                : reportNeedsSubmit
                ? 'bg-amber-500 text-black animate-pulse hover:animate-none hover:bg-amber-400'
                : 'bg-neon-purple hover:bg-neon-purple/80'
            }`}
            disabled={reportSubmitted}
          >
            {reportSubmitted ? (
              <><Check className="w-4 h-4" />Сдан</>
            ) : (
              <><Send className="w-4 h-4" />Сдать отчёт</>
            )}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <NoteField
          icon={<BookOpen className="w-4 h-4" />}
          title="Прогресс"
          value={notes.progress}
          placeholder="Текущий уровень, достижения..."
          onChange={(v) => update('progress', v)}
          storageKey={`${student.id}:progress`}
        />
        <NoteField
          icon={<Target className="w-4 h-4" />}
          title="План на будущее"
          value={notes.futurePlan}
          placeholder="Цели, направления развития..."
          onChange={(v) => update('futurePlan', v)}
          storageKey={`${student.id}:futurePlan`}
        />
        <NoteField
          icon={<Home className="w-4 h-4" />}
          title="Домашнее задание"
          value={notes.homework}
          placeholder="Текущее задание..."
          onChange={(v) => update('homework', v)}
          storageKey={`${student.id}:homework`}
        />
        <div className="h-8" />
      </div>
    </div>
  );
}

function NoteField({
  icon, title, value, placeholder, onChange, storageKey,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  storageKey?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Restore saved min-height on mount, then auto-grow on every value change
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Restore saved height first
    if (storageKey) {
      const saved = localStorage.getItem(`notefield_h:${storageKey}`);
      if (saved) el.style.minHeight = saved;
    }
    // Grow to fit content
    el.style.height = 'auto';
    const newH = Math.max(el.scrollHeight, parseInt(el.style.minHeight || '0') || 0);
    el.style.height = `${newH}px`;
    // Persist the grown height as min-height
    if (storageKey && el.scrollHeight > 80) {
      localStorage.setItem(`notefield_h:${storageKey}`, `${newH}px`);
    }
  }, [value, storageKey]);

  return (
    <div className="glass p-4 rounded-xl space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white/60">
          {icon}
          <span className="text-sm font-medium">{title}</span>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none transition-colors text-sm resize-none overflow-hidden"
      />
    </div>
  );
}
