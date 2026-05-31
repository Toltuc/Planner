'use client';

import React, { useState, useMemo, useCallback } from 'react'; // useCallback kept for handlers
import { Plus, Trash2, Edit2, Check, X, TrendingUp, Users, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useAppStore } from '@/store/appStore';
import { useToastStore } from '@/store/toastStore';
import type { Tariff } from '@/types';
import { isUserLesson, SYSTEM_STUDENT_NAMES } from '@/types';

// Error Boundary for modal
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

export default function Statistics() {
  const students = useAppStore((state) => state.students);
  const dailyReports = useAppStore((state) => state.dailyReports);
  const tariffs = useAppStore((state) => state.tariffs);
  const addTariff = useAppStore((state) => state.addTariff);
  const updateTariff = useAppStore((state) => state.updateTariff);
  const deleteTariff = useAppStore((state) => state.deleteTariff);
  const deleteDailyReport = useAppStore((state) => state.deleteDailyReport);
  const getLessonsByDate = useAppStore((state) => state.getLessonsByDate);
  const isInitialized = useAppStore((state) => state.isInitialized);
  const showToast = useToastStore((state) => state.showToast);

  const [showTariffModal, setShowTariffModal] = useState(false);
  const [editingTariff, setEditingTariff] = useState<Tariff | null>(null);
  const [tariffForm, setTariffForm] = useState({ name: '', lessons: 1, price: 0 });

  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showReportsViewer, setShowReportsViewer] = useState(false);

  // Students stats — active = not frozen and not reserve; inactive = frozen + reserve
  const studentsStats = useMemo(() => {
    const realStudents = students.filter(s => !SYSTEM_STUDENT_NAMES.includes(s.fullName));
    const totalStudents = realStudents.length;
    // Active: not frozen and not reserve
    const activeStudents = realStudents.filter(s => !s.isFrozen && s.status !== 'reserve').length;
    // Inactive: frozen + reserve
    const inactiveStudents = realStudents.filter(s => s.isFrozen || s.status === 'reserve').length;
    return { totalStudents, activeStudents, inactiveStudents };
  }, [students]);

  // Reports for selected date
  const reportsForDate = useMemo(() => {
    return dailyReports.filter(r => r.date === selectedDate);
  }, [dailyReports, selectedDate]);

  const lessonsForDate = useMemo(() => {
    return getLessonsByDate(selectedDate).filter(isUserLesson);
  }, [getLessonsByDate, selectedDate]);

  const handlePrevDay = useCallback(() => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() - 1);
    setSelectedDate(date.toISOString().split('T')[0]);
  }, [selectedDate]);

  const handleNextDay = useCallback(() => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + 1);
    setSelectedDate(date.toISOString().split('T')[0]);
  }, [selectedDate]);

  const handleAddTariff = useCallback(() => {
    setEditingTariff(null);
    setTariffForm({ name: '', lessons: 1, price: 0 });
    setShowTariffModal(true);
  }, []);

  const handleEditTariff = useCallback((tariff: Tariff) => {
    setEditingTariff(tariff);
    setTariffForm({ name: tariff.name, lessons: tariff.lessons, price: tariff.price });
    setShowTariffModal(true);
  }, []);

  const handleSaveTariff = useCallback(() => {
    if (!tariffForm.name.trim()) {
      showToast('Введите название тарифа', 'error');
      return;
    }
    if (tariffForm.lessons < 1) {
      showToast('Количество занятий должно быть минимум 1', 'error');
      return;
    }
    if (tariffForm.price < 0) {
      showToast('Цена не может быть отрицательной', 'error');
      return;
    }

    if (editingTariff) {
      updateTariff(editingTariff.id, tariffForm);
      showToast('Тариф обновлен', 'success');
    } else {
      addTariff(tariffForm);
      showToast('Тариф добавлен', 'success');
    }
    setShowTariffModal(false);
  }, [tariffForm, editingTariff, addTariff, updateTariff, showToast]);

  const handleDeleteTariff = useCallback((id: string) => {
    if (confirm('Удалить этот тариф?')) {
      deleteTariff(id);
      showToast('Тариф удален', 'info');
    }
  }, [deleteTariff, showToast]);

  const handleDeleteReport = useCallback((lessonId: string, date: string) => {
    if (confirm('Удалить этот отчет?')) {
      deleteDailyReport(lessonId, date);
      showToast('Отчет удален', 'info');
    }
  }, [deleteDailyReport, showToast]);

  // Loading state
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-neon-purple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-x-hidden">
      {/* Header + tabs */}
      <div className="glass-medium px-4 pt-3 pb-0">
        <h1 className="text-base font-semibold mb-2">Статистика</h1>
      </div>

      <div className="flex-1 overflow-y-auto">

      <div className="px-4 pt-3 pb-2">
        {/* Students block */}
        <div className="glass px-3 py-2.5 rounded-xl space-y-2">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-neon-purple" />
            <span className="text-[10px] text-white/60">Ученики</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-[9px] text-white/40 mb-0.5">Активных</p>
              <p className="text-xl font-bold text-emerald-400">{studentsStats.activeStudents}</p>
            </div>
            <div>
              <p className="text-[9px] text-white/40 mb-0.5">Неактивных</p>
              <p className="text-xl font-bold text-amber-400">{studentsStats.inactiveStudents}</p>
            </div>
            <div>
              <p className="text-[9px] text-white/40 mb-0.5">Всего</p>
              <p className="text-xl font-bold text-white/70">{studentsStats.totalStudents}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Saved Reports Section */}
      <div className="px-4 pb-3 shrink-0">
        <button
          onClick={() => setShowReportsViewer(!showReportsViewer)}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-neon-cyan" />
            <span className="text-sm font-medium">Сохраненные отчеты</span>
          </div>
          <span className="text-xs text-white/40">
            {showReportsViewer ? 'Скрыть' : 'Показать'} ({dailyReports.length} отчетов)
          </span>
        </button>

        {showReportsViewer && (
          <div className="mt-3 space-y-3">
            {/* Date Navigator */}
            <div className="flex items-center justify-between p-2 rounded-xl bg-white/5">
              <button
                onClick={handlePrevDay}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Предыдущий день"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="text-center">
                <p className="text-sm font-medium">
                  {format(parseISO(selectedDate), 'EEEE, d MMMM', { locale: ru })}
                </p>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="text-xs bg-transparent border-none text-white/60 focus:outline-none cursor-pointer"
                />
              </div>
              <button
                onClick={handleNextDay}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Следующий день"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Reports List */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {lessonsForDate.length === 0 ? (
                <p className="text-center text-white/40 text-sm py-4">Нет уроков на этот день</p>
              ) : (
                lessonsForDate.map((lesson) => {
                  const report = reportsForDate.find(r => r.lessonId === lesson.id);
                  const student = students.find(s => s.id === lesson.studentId);
                  return (
                    <div
                      key={lesson.id}
                      className={`p-3 rounded-xl border ${
                        report
                          ? report.status === 'present'
                            ? 'bg-emerald-500/10 border-emerald-500/30'
                            : report.status === 'absent'
                            ? 'bg-red-500/10 border-red-500/30'
                            : report.status === 'frozen'
                            ? 'bg-blue-500/10 border-blue-500/30'
                            : report.status === 'rescheduled'
                            ? 'bg-amber-500/10 border-amber-500/30'
                            : 'bg-white/5 border-white/10'
                          : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{student?.fullName || lesson.studentName || 'Неизвестно'}</p>
                          <p className="text-xs text-white/60">{lesson.time}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {report ? (
                            <>
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                report.status === 'present'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : report.status === 'absent'
                                  ? 'bg-red-500/20 text-red-400'
                                  : report.status === 'frozen'
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : report.status === 'rescheduled'
                                  ? 'bg-amber-500/20 text-amber-400'
                                  : 'bg-white/5 text-white/60'
                              }`}>
                                {report.status === 'present' && 'Был'}
                                {report.status === 'absent' && 'Прогул'}
                                {report.status === 'frozen' && 'Заморозка'}
                                {report.status === 'rescheduled' && 'Перенос'}
                              </span>
                              <button
                                onClick={() => handleDeleteReport(report.lessonId, report.date)}
                                className="p-1 rounded hover:bg-red-500/20 text-red-400 transition-colors"
                                title="Удалить отчет"
                                aria-label="Удалить отчет"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-white/40">Нет отчета</span>
                          )}
                        </div>
                      </div>
                      {report?.newDate && (
                        <p className="text-xs text-amber-400 mt-1">
                          Перенос на: {format(parseISO(report.newDate), 'd MMMM', { locale: ru })}
                        </p>
                      )}
                      {report?.freezeUntil && (
                        <p className="text-xs text-blue-400 mt-1">
                          Заморозка до: {format(parseISO(report.freezeUntil), 'd MMMM', { locale: ru })}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tariffs Section */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-neon-purple" />
            Тарифы
          </h2>
          <button
            onClick={handleAddTariff}
            className="p-1.5 rounded-lg bg-neon-purple/20 hover:bg-neon-purple/30 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          {tariffs.length === 0 ? (
            <p className="text-center text-white/40 text-sm py-4">Нет тарифов. Добавьте первый.</p>
          ) : (
            tariffs.map((tariff) => (
              <div
                key={tariff.id}
                className="glass p-4 rounded-xl flex items-start justify-between gap-3"
              >
                <div className="space-y-1 flex-1 min-w-0">
                  <p className="font-semibold text-base break-words whitespace-normal leading-snug">{tariff.name}</p>
                  <p className="text-sm text-white/60">
                    {tariff.lessons} занятий • {tariff.price.toLocaleString()} ₽
                  </p>
                  <p className="text-xs text-white/40">
                    {Math.round(tariff.price / tariff.lessons).toLocaleString()} ₽ за занятие
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditTariff(tariff)}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                    aria-label="Редактировать тариф"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDeleteTariff(tariff.id)}
                    className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                    aria-label="Удалить тариф"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      </div>

      {/* Tariff Modal with Error Boundary */}
      {showTariffModal && (
        <ModalErrorBoundary onClose={() => setShowTariffModal(false)}>
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center modal-overlay">
            <div className="bg-dark-800 w-full max-w-sm mx-4 mb-4 sm:mb-0 rounded-2xl border border-white/10 p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">
                  {editingTariff ? 'Редактировать тариф' : 'Новый тариф'}
                </h2>
                <button
                  onClick={() => setShowTariffModal(false)}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                  aria-label="Закрыть"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-white/60 mb-1">Название</label>
                <input
                  type="text"
                  value={tariffForm.name}
                  onChange={(e) => setTariffForm({ ...tariffForm, name: e.target.value })}
                  placeholder="Например: Разовое"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/60 mb-1">Кол-во занятий</label>
                  <input
                    type="number"
                    value={tariffForm.lessons || ''}
                    onChange={(e) => setTariffForm({ ...tariffForm, lessons: Number(e.target.value) })}
                    placeholder="1"
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/60 mb-1">Цена (₽)</label>
                  <input
                    type="number"
                    value={tariffForm.price || ''}
                    onChange={(e) => setTariffForm({ ...tariffForm, price: Number(e.target.value) })}
                    placeholder="1500"
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowTariffModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm"
              >
                Отмена
              </button>
              <button
                onClick={handleSaveTariff}
                className="flex-1 px-4 py-2.5 rounded-xl bg-neon-purple hover:bg-neon-purple/80 transition-colors text-sm font-medium flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                Сохранить
              </button>
              </div>
            </div>
          </div>
        </ModalErrorBoundary>
      )}
    </div>
  );
}
