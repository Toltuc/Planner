'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { X, CheckCircle, XCircle, Calendar, Snowflake, RefreshCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useAppStore } from '@/store/appStore';
import { useToastStore } from '@/store/toastStore';
import { useModalBackButton } from '@/components/BackButtonHandler';
import type { Lesson, ReportStatus, Student } from '@/types';
import { isUserLesson } from '@/types';

interface DailyReportModalProps {
  date: string;
  onClose: () => void;
}

export default function DailyReportModal({ date, onClose }: DailyReportModalProps) {
  const { students, getLessonsByDate, addDailyReport, addLesson, deleteDailyReport, applyLessonCharge, applyAbsenceFine, getReportsByDate, dailyReports, updateStudent, updateLesson } = useAppStore();
  const showToast = useToastStore((state) => state.showToast);

  // Handle back button to close modal
  useModalBackButton('dailyReport', true, onClose);

  const todayLessons = useMemo(
    () => getLessonsByDate(date).filter(l => {
      if (!isUserLesson(l)) return false;
      // Hide isFreeSlot lessons without a replacement, unless the original student is frozen
      if (l.isFreeSlot && !l.freeSlotReplacementId) {
        const originalStudent = students.find(s => s.id === l.studentId);
        if (!originalStudent?.isFrozen) return false;
      }
      return true;
    }),
    [date, getLessonsByDate, students]
  );

  // Load existing reports from store when modal opens
  const existingReports = useMemo(() => getReportsByDate(date), [date, getReportsByDate]);

  const [reports, setReports] = useState<Record<string, { status: ReportStatus; newDate?: string; fine?: number; freezeUntil?: string }>>({});

  // Initialize reports ONCE on mount from existing saved data only
  useEffect(() => {
    const saved = getReportsByDate(date);
    const initialReports: Record<string, { status: ReportStatus; newDate?: string; fine?: number; freezeUntil?: string }> = {};
    saved.forEach((r) => {
      initialReports[r.lessonId] = {
        status: r.status,
        newDate: r.newDate,
        fine: r.fineAmount,
      };
    });
    setReports(initialReports);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // [] — run only once on open, not on every store update

  const getStudent = (studentId: string): Student | undefined => {
    return students.find((s) => s.id === studentId);
  };

  const handleStatusChange = (lessonId: string, status: ReportStatus) => {
    setReports((prev) => {
      const current = prev[lessonId];
      // Toggle off if same status clicked again
      if (current?.status === status) {
        const { status: _, ...rest } = current;
        return { ...prev, [lessonId]: rest as typeof current };
      }
      return { ...prev, [lessonId]: { ...current, status } };
    });
  };

  const handleNewDateChange = (lessonId: string, newDate: string) => {
    setReports((prev) => ({
      ...prev,
      [lessonId]: { ...prev[lessonId], newDate },
    }));
  };

  const handleSubmitReport = async () => {
    let processedCount = 0;
    const skippedDeductions: string[] = [];

    for (const l of todayLessons) {
      if (!reports[l.id]?.status) {
        await deleteDailyReport(l.id, date);
      }
    }

    for (const l of todayLessons) {
      const report = reports[l.id];
      if (!report?.status) continue;

      const prevReport = existingReports.find((r) => r.lessonId === l.id);
      const prevStatus = prevReport?.status;

      const status = report.status;
      const fineAmount = report?.fine || 0;
      const newDate = report?.newDate;
      const freezeUntil = report?.freezeUntil;

      const isChanged =
        prevStatus !== status ||
        prevReport?.fineAmount !== fineAmount ||
        prevReport?.newDate !== newDate ||
        prevReport?.freezeUntil !== freezeUntil;

      if (isChanged) {
        await addDailyReport({
          lessonId: l.id,
          studentId: l.studentId,
          date,
          status,
          fineAmount,
          newDate,
          freezeUntil,
        });
      }

      if (prevStatus === status) {
        processedCount++;
        continue;
      }

      // --- UNDO previous status effect before applying new one ---
      const isReplacementLessonUndo = !!(l.isFreeSlot && l.freeSlotReplacementId);
      const undoStudentId = isReplacementLessonUndo ? l.freeSlotReplacementId! : l.studentId;
      if (prevStatus) {
        const freshStudent = useAppStore.getState().students.find(s => s.id === undoStudentId);
        if (freshStudent) {
          if (prevStatus === 'present') {
            // Reverse lesson charge: return +1 to balance
            updateStudent(freshStudent.id, { balance: freshStudent.balance + 1 });
          } else if (prevStatus === 'absent') {
            // Reverse absence fine: return fine amount
            const prevFine = prevReport?.fineAmount || 1;
            updateStudent(freshStudent.id, { balance: freshStudent.balance + prevFine });
          } else if (prevStatus === 'frozen') {
            // Undo freeze: unfreeze student so they can be frozen again this month
            updateStudent(freshStudent.id, {
              isFrozen: false,
              freezeFrom: undefined,
              freezeTo: undefined,
              lastFreezeMonth: undefined,
            });
            // Remove free slot status from the lesson
            updateLesson(l.id, { isFreeSlot: false });
          }
        }
      }

      // For isFreeSlot with replacement — charge replacement student, skip original
      const isReplacementLesson = !!(l.isFreeSlot && l.freeSlotReplacementId);
      const chargeStudentId = isReplacementLesson ? l.freeSlotReplacementId! : l.studentId;

      // Handle new status actions
      switch (status) {
        case 'present': {
          const freshStudent = useAppStore.getState().students.find(s => s.id === chargeStudentId);
          if (freshStudent) {
            applyLessonCharge(chargeStudentId, l.date);
          }
          break;
        }
        case 'absent': {
          const freshStudent = useAppStore.getState().students.find(s => s.id === chargeStudentId);
          if (freshStudent && !freshStudent.isFrozen) {
            applyAbsenceFine(chargeStudentId, fineAmount || 1);
          }
          break;
        }
        case 'rescheduled':
          if (newDate) {
            const freshStudent = useAppStore.getState().students.find((s) => s.id === chargeStudentId);
            if (freshStudent) {
              await addLesson({
                studentId: chargeStudentId,
                studentName: freshStudent.fullName,
                date: newDate,
                time: l.time,
                duration: l.duration,
                isRecurring: false,
                lessonType: l.lessonType,
                notes: l.notes,
                isFreeSlot: false,
                status: 'scheduled',
                rescheduledFrom: l.id,
              });
            }
          }
          break;
        case 'frozen': {
          const freezeMonth = date.slice(0, 7);
          const freshStudent = useAppStore.getState().students.find(s => s.id === chargeStudentId);
          if (freshStudent && freshStudent.lastFreezeMonth === freezeMonth && !freshStudent.isFrozen) {
            showToast(`${freshStudent.fullName}: заморозка уже использована в этом месяце`, 'error');
            break;
          }
          if (freshStudent) {
            updateStudent(freshStudent.id, {
              isFrozen: true,
              freezeFrom: date,
              freezeTo: freezeUntil || undefined,
              lastFreezeMonth: freezeMonth,
            });
          }
          // Mark lesson as free slot so a replacement can be scheduled
          updateLesson(l.id, { isFreeSlot: true });
          break;
        }
      }

      processedCount++;
    }

    if (processedCount > 0) {
      let message = `Сохранено отчетов: ${processedCount}`;
      if (skippedDeductions.length > 0) {
        message += `. Недостаточно средств у: ${skippedDeductions.join(', ')}`;
      }
      showToast(message, 'success');
    } else if (todayLessons.length === 0) {
      showToast('Нет уроков для отчета', 'info');
    } else {
      showToast('Нет изменений в отчетах', 'info');
    }
    onClose();
  };

  const handleFreezeDateChange = (lessonId: string, freezeUntil: string) => {
    setReports((prev) => ({
      ...prev,
      [lessonId]: { ...prev[lessonId], freezeUntil },
    }));
  };

  const statusButtons = [
    { status: 'present' as ReportStatus, label: 'Был', icon: CheckCircle, color: 'status-present' },
    { status: 'absent' as ReportStatus, label: 'Прогул', icon: XCircle, color: 'status-absent' },
    { status: 'rescheduled' as ReportStatus, label: 'Перенос', icon: RefreshCw, color: 'status-frozen' },
    { status: 'frozen' as ReportStatus, label: 'Заморозка', icon: Snowflake, color: 'status-frozen' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center modal-overlay">
      <div className="bg-dark-800 w-full max-w-lg mx-4 mb-4 sm:mb-0 rounded-2xl border border-white/10 overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div>
            <h2 className="text-lg font-semibold">Ежедневный отчет</h2>
            <p className="text-xs text-white/60">
              {format(parseISO(date), 'EEEE, d MMMM', { locale: ru })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lesson List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {todayLessons.length === 0 ? (
            <div className="text-center py-8 text-white/40">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Нет уроков на сегодня</p>
            </div>
          ) : (
            todayLessons.map((lesson) => {
              // For isFreeSlot with replacement — show replacement student info
              const isReplacement = !!(lesson.isFreeSlot && lesson.freeSlotReplacementId);
              const displayStudent = isReplacement
                ? getStudent(lesson.freeSlotReplacementId!)
                : getStudent(lesson.studentId);
              const report = reports[lesson.id];

              return (
                <div
                  key={lesson.id}
                  className={`glass p-4 rounded-xl space-y-3 ${
                    report ? 'border-neon-purple/30' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {displayStudent?.fullName || 'Неизвестно'}
                        {isReplacement && <span className="ml-1.5 text-[10px] text-green-400 font-normal">замена</span>}
                      </p>
                      <p className="text-xs text-white/60">
                        {lesson.time} • Баланс: {displayStudent?.balance ?? 0} уроков
                      </p>
                    </div>
                  </div>
                  {report?.status === 'rescheduled' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/50">Перенести на:</span>
                      <input
                        type="date"
                        value={report.newDate || ''}
                        onChange={(e) => handleNewDateChange(lesson.id, e.target.value)}
                        className="flex-1 px-2 py-1 text-xs rounded-lg bg-white/5 border border-white/10 text-white"
                      />
                    </div>
                  )}
                  {report?.status === 'frozen' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/50">Заморозка до:</span>
                      <input
                        type="date"
                        value={report.freezeUntil || ''}
                        onChange={(e) => handleFreezeDateChange(lesson.id, e.target.value)}
                        className="flex-1 px-2 py-1 text-xs rounded-lg bg-white/5 border border-white/10 text-white"
                      />
                    </div>
                  )}

                  {/* Status Buttons */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {statusButtons.map(({ status, label, icon: Icon, color }) => (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(lesson.id, status)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
                          report?.status === status
                            ? `${color} text-white`
                            : 'bg-white/5 hover:bg-white/10'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-[10px]">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 p-3 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm font-medium"
          >
            Отмена
          </button>
          <button
            onClick={handleSubmitReport}
            disabled={Object.values(reports).filter(r => r.status).length === 0}
            className="flex-1 px-3 py-2.5 rounded-xl bg-neon-purple hover:bg-neon-purple/80 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            Сдать отчет ({Object.values(reports).filter(r => r.status).length}/{todayLessons.length})
          </button>
        </div>
      </div>
    </div>
  );
}
