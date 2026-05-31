'use client';

import React, { useState, useCallback } from 'react';
import { X, Wallet, History } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useToastStore } from '@/store/toastStore';
import { useModalBackButton } from '@/components/BackButtonHandler';
import type { Student, StudentStatus, Tariff, TariffHistory } from '@/types';

const BUILTIN_IDS_NO_FROZEN = ['regular', 'reserve'] as const;
const DEFAULT_BUILTIN_LABELS: Record<string, string> = {
  regular: 'Постоянные',
  reserve: 'Резерв',
};

function getBuiltinSectionOptions() {
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('student_filter_labels') : null;
    const labels: Record<string, string> = saved ? { ...DEFAULT_BUILTIN_LABELS, ...JSON.parse(saved) } : DEFAULT_BUILTIN_LABELS;
    const orderRaw = typeof window !== 'undefined' ? localStorage.getItem('student_filter_order') : null;
    const order: string[] = orderRaw ? JSON.parse(orderRaw) : Object.keys(labels);
    // All builtin ids except frozen, in user-defined order
    const ids = order.filter((id) => id !== 'frozen' && labels[id]);
    // Ensure regular and reserve are always present
    for (const id of BUILTIN_IDS_NO_FROZEN) {
      if (!ids.includes(id)) ids.push(id);
    }
    return ids.map((id) => ({
      id,
      label: labels[id] || id,
      hint: id === 'regular' ? 'isRecurring' : id === 'reserve' ? 'reserve' : 'builtin',
    }));
  } catch {
    return [
      { id: 'regular', label: 'Постоянные', hint: 'isRecurring' },
      { id: 'reserve',  label: 'Резерв',     hint: 'reserve' },
    ];
  }
}

interface StudentModalProps {
  student?: Student;
  onClose: () => void;
}

// Tariff Selector Component
interface TariffFormData {
  tariff: number;
  tariffId?: string;
  tariffHistory?: TariffHistory[];
}

interface TariffSelectorProps {
  formData: TariffFormData;
  setFormData: (data: TariffFormData) => void;
  isEditing: boolean;
  student?: Student;
  showHistory: boolean;
  setShowHistory: (show: boolean) => void;
}

function TariffSelector({ formData, setFormData, isEditing, student, showHistory, setShowHistory }: TariffSelectorProps) {
  const { tariffs } = useAppStore();
  const selectedTariff = tariffs.find((t: Tariff) => t.id === formData.tariffId);

  const handleTariffChange = (tariffId: string) => {
    const tariff = tariffs.find((t: Tariff) => t.id === tariffId);
    if (!tariff) return;

    // Build updated history
    const now = new Date().toISOString().split('T')[0];
    let newHistory: TariffHistory[] = formData.tariffHistory || [];

    if (isEditing && student && student.tariffId && student.tariffId !== tariffId) {
      // Close previous tariff history entry
      const lastEntry = newHistory[newHistory.length - 1];
      if (lastEntry && !lastEntry.toDate) {
        lastEntry.toDate = now;
      }
      // Add new entry
      newHistory.push({
        tariffId: tariff.id,
        name: tariff.name,
        lessons: tariff.lessons,
        price: tariff.price,
        fromDate: now,
      });
    } else if (!isEditing) {
      // New student - start fresh history
      newHistory = [{
        tariffId: tariff.id,
        name: tariff.name,
        lessons: tariff.lessons,
        price: tariff.price,
        fromDate: now,
      }];
    }

    setFormData({
      ...formData,
      tariff: tariff.price,
      tariffId: tariff.id,
      tariffHistory: newHistory,
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm text-white/60">Тариф</label>
        {isEditing && student && student.tariffHistory && student.tariffHistory.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="text-xs text-neon-purple hover:underline flex items-center gap-1"
          >
            <History className="w-3 h-3" />
            {showHistory ? 'Скрыть историю' : 'История тарифов'}
          </button>
        )}
      </div>

      <select
        value={formData.tariffId || ''}
        onChange={(e) => handleTariffChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none transition-colors"
      >
        <option value="">Выберите тариф...</option>
        {tariffs.map((t: Tariff) => (
          <option key={t.id} value={t.id}>
            {t.name} - {t.price.toLocaleString()} ₽ ({t.lessons} занятий)
          </option>
        ))}
      </select>

      {selectedTariff && (
        <p className="text-xs text-white/40">
          {selectedTariff.lessons} занятий по {Math.round(selectedTariff.price / selectedTariff.lessons).toLocaleString()} ₽ за занятие
        </p>
      )}

      {/* Tariff History */}
      {showHistory && student?.tariffHistory && student.tariffHistory.length > 0 && (
        <div className="mt-3 p-3 rounded-xl bg-white/5 border border-white/10">
          <p className="text-xs font-medium text-white/60 mb-2">История изменений:</p>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {student.tariffHistory.map((entry: TariffHistory, idx: number) => (
              <div key={idx} className="text-xs flex justify-between">
                <span>{entry.name}</span>
                <span className="text-white/40">
                  {entry.fromDate} - {entry.toDate || 'настоящее время'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StudentModal({ student, onClose }: StudentModalProps) {
  const { students, addStudent, updateStudent, recordPayment, tariffs, customStudentFilters } = useAppStore(); 
  const showToast = useToastStore((state) => state.showToast);

  // Handle back button to close modal
  useModalBackButton('student', true, onClose);

  const isEditing = !!student;

  const [formData, setFormData] = useState({
    fullName: student?.fullName || '',
    phone: student?.phone || '',
    tariff: student?.tariff || 0,
    tariffId: student?.tariffId || '',
    balance: student?.balance || 0,
    status: student?.status || 'active' as StudentStatus,
    isRecurring: student?.isRecurring ?? true,
    notes: student?.notes || { progress: '', futurePlan: '', homework: '' },
    tariffHistory: student?.tariffHistory || [],
    hasReview: student?.hasReview || false,
    isFrozen: student?.isFrozen || false,
    freezeFrom: student?.freezeFrom || '',
    freezeTo: student?.freezeTo || '',
    lastPaymentDate: student?.lastPaymentDate || '',
    sections: student?.sections || [] as string[],
  });

  const [paymentAmount, setPaymentAmount] = useState<number | ''>('');
  const [showTariffHistory, setShowTariffHistory] = useState(false);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.fullName.trim()) {
      showToast('Введите ФИО', 'error');
      return;
    }

    if (isEditing && student) {
      let saveData = { ...formData };
      // If student was frozen and now being unfrozen — restore balance for skipped lessons
      if (student.isFrozen && !formData.isFrozen) {
        const today = new Date().toISOString().split('T')[0];
        const freezeStart = student.freezeFrom || today;
        const { lessons: allLessons, tariffs: allTariffs } = useAppStore.getState();
        const frozenCount = allLessons.filter((l) =>
          l.studentId === student.id &&
          l.date >= freezeStart &&
          l.date <= today
        ).length;
        const tariffObj = allTariffs.find((t) => t.id === student.tariffId);
        const days = Math.max(0, Math.round(
          (new Date(today).getTime() - new Date(freezeStart).getTime()) / 86400000
        ));
        const restored = frozenCount > 0
          ? frozenCount
          : (tariffObj ? Math.round(days * (tariffObj.lessons / 30)) : 0);
        saveData = {
          ...saveData,
          balance: formData.balance + restored,
          freezeTo: saveData.freezeTo || today,
        };
        if (restored > 0) {
          showToast(`Разморожен. +${restored} ур. возвращено`, 'success');
        }
      }
      updateStudent(student.id, saveData);
      if (!(student.isFrozen && !formData.isFrozen)) {
        showToast('Ученик обновлен', 'success');
      }
    } else {
      // If new student has balance, set payment date to today
      const today = new Date().toISOString().split('T')[0];
      const newStudentData = formData.balance > 0
        ? { ...formData, lastPaymentDate: today }
        : formData;
      addStudent(newStudentData);
      showToast('Ученик добавлен', 'success');
    }
    onClose();
  }, [formData, isEditing, student, addStudent, updateStudent, onClose, showToast]);

  const handlePayment = () => {
    if (!student) return;
    const selectedTariff = tariffs.find((t: Tariff) => t.id === formData.tariffId);
    const tariffPrice = selectedTariff ? selectedTariff.lessons : 1;
    const amount = typeof paymentAmount === 'number' && paymentAmount > 0 ? paymentAmount : tariffPrice;
    const today = new Date().toISOString().split('T')[0];
    recordPayment(student.id, amount);
    setFormData({ ...formData, balance: formData.balance + amount, lastPaymentDate: today });
    setPaymentAmount('');
    showToast(`Пополнено на ${amount} уроков`, 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center modal-overlay">
      <div className="bg-dark-800 w-full max-w-md mx-4 mb-4 sm:mb-0 rounded-2xl border border-white/10 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-lg font-semibold">
            {isEditing ? 'Редактировать ученика' : 'Новый ученик'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <form id="student-form" onSubmit={handleSubmit} className="p-4 space-y-4">
            {/* Full Name */}
            <div>
              <label className="block text-sm text-white/60 mb-1">ФИО</label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="Иванов Иван Иванович"
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none transition-colors"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm text-white/60 mb-1">Телефон</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+7 (999) 123-45-67"
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none transition-colors"
              />
            </div>

            {/* Tariff Selection */}
            <TariffSelector
              formData={formData}
              setFormData={(tariffData) => setFormData({ ...formData, ...tariffData })}
              isEditing={isEditing}
              student={student}
              showHistory={showTariffHistory}
              setShowHistory={setShowTariffHistory}
            />

            {/* Balance */}
            <div>
              <label className="block text-sm text-white/60 mb-1">Баланс (уроков)</label>
              <input
                type="number"
                value={formData.balance || ''}
                onChange={(e) => setFormData({ ...formData, balance: Number(e.target.value) })}
                placeholder="4"
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-neon-purple focus:outline-none transition-colors"
              />
            </div>

            {/* Section picker */}
            <div>
              <label className="block text-sm text-white/60 mb-2">Раздел</label>
              <div className="flex flex-wrap gap-2">
                {[
                  ...getBuiltinSectionOptions(),
                  ...customStudentFilters.map((f) => ({ id: `custom:${f}`, label: f, hint: 'custom' })),
                ].map((opt) => {
                  const isSelected =
                    opt.hint === 'isRecurring' ? formData.isRecurring && formData.status === 'active' :
                    opt.hint === 'reserve'     ? formData.status === 'reserve' :
                    formData.sections.includes(opt.label);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        if (opt.hint === 'isRecurring') {
                          // Toggle: if already selected — deselect (back to plain active)
                          if (isSelected) {
                            setFormData({ ...formData, isRecurring: false, status: 'active' as StudentStatus });
                          } else {
                            setFormData({ ...formData, isRecurring: true, status: 'active' as StudentStatus });
                          }
                        } else if (opt.hint === 'reserve') {
                          // Toggle: if already reserve — deselect
                          if (isSelected) {
                            setFormData({ ...formData, status: 'active' as StudentStatus, isRecurring: false });
                          } else {
                            setFormData({ ...formData, status: 'reserve' as StudentStatus, isRecurring: false });
                          }
                        } else {
                          // custom / other builtin — toggle in sections
                          const next = isSelected
                            ? formData.sections.filter((s) => s !== opt.label)
                            : [...formData.sections, opt.label];
                          setFormData({ ...formData, sections: next });
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                        isSelected
                          ? 'bg-neon-purple/30 border-neon-purple text-white'
                          : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:border-white/30'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Review Toggle */}
            <div>
              <label className="block text-sm text-white/60 mb-1">Отзыв оставлен</label>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, hasReview: !formData.hasReview })}
                className={`w-full px-3 py-2.5 rounded-xl border transition-colors flex items-center justify-center gap-2 ${
                  formData.hasReview
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                    : 'bg-white/5 border-white/10'
                }`}
              >
                {formData.hasReview ? 'Да, отзыв оставлен' : 'Нет, отзыва нет'}
              </button>
            </div>

            {/* Spacer for footer */}
            <div className="h-20" />
          </form>
        </div>

        {/* Fixed Footer with Actions */}
        <div className="flex-shrink-0 border-t border-white/10 p-4 bg-dark-800/95 backdrop-blur-md">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-base font-medium"
            >
              Отмена
            </button>
            <button
              type="submit"
              form="student-form"
              className="flex-1 px-4 py-3 rounded-xl bg-neon-purple hover:bg-neon-purple/80 transition-colors text-base font-medium"
            >
              {isEditing ? 'Сохранить' : 'Добавить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

