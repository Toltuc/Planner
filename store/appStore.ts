import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { format, addDays, startOfWeek, parseISO, isSameWeek } from 'date-fns';
import type { AppState, Student, Lesson, DailyReport, Tariff, TariffHistory, WorkingHours } from '@/types';
import { isUserLesson, SYSTEM_STUDENT_ID } from '@/types';
import * as SQLite from '@/lib/sqlite';

interface HistoryState {
  students: Student[];
  archivedStudents: Student[];
  lessons: Lesson[];
  dailyReports: DailyReport[];
  tariffs: Tariff[];
  workingHours: WorkingHours;
}

interface StoreWithHistory extends AppState {
  history: HistoryState[];
  historyIndex: number;
  isInitialized: boolean;
  _saveToHistory: () => void;
}

const MAX_HISTORY = 30;

const getWeekStart = (date: Date = new Date()): string => {
  return format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
};

const defaultWorkingHours: WorkingHours = {
  enabled: false,
  startHour: 10,
  endHour: 22,
};

const defaultTariffs: Tariff[] = [
  { id: uuidv4(), name: 'Разовое', lessons: 1, price: 1500, createdAt: new Date().toISOString() },
  { id: uuidv4(), name: '2 занятия', lessons: 2, price: 2800, createdAt: new Date().toISOString() },
  { id: uuidv4(), name: '4 занятия', lessons: 4, price: 5200, createdAt: new Date().toISOString() },
  { id: uuidv4(), name: '8 занятий', lessons: 8, price: 9600, createdAt: new Date().toISOString() },
];

export const useAppStore = create<StoreWithHistory>((set, get) => ({
  // Initial state
  students: [],
  lessons: [],
  dailyReports: [],
  tariffs: defaultTariffs,
  workingHours: defaultWorkingHours,
  currentWeekStart: getWeekStart(),
  history: [],
  historyIndex: -1,
  canUndo: false,
  canRedo: false,
  isInitialized: false,
  theme: 'neon' as 'neon' | 'brand' | 'ocean' | 'forest' | 'sunset' | 'midnight' | 'cherry' | 'mint' | 'gold' | 'lavender' | 'coffee' | 'nordic' | 'rose' | 'cyber' | 'autumn' | 'winter' | 'sakura' | 'neonpink' | 'matrix' | 'amoled' | 'retro' | 'bubblegum' | 'slate' | 'mocha',
  scheduleScale: 1,
  studentsScale: 0.6,
  lessonColors: {
    regular:  '#f97316',
    one_time: '#9333ea',
    single:   '#16a34a',
    break:    '#22d3ee',
    business: '#f472b6',
  },
  customStudentFilters: [],
  archivedStudents: [],

  // History management
  _saveToHistory: () => {
    const { students, archivedStudents, lessons, dailyReports, tariffs, workingHours, history, historyIndex } = get();
    const newState: HistoryState = {
      students: JSON.parse(JSON.stringify(students)),
      archivedStudents: JSON.parse(JSON.stringify(archivedStudents)),
      lessons: JSON.parse(JSON.stringify(lessons)),
      dailyReports: JSON.parse(JSON.stringify(dailyReports)),
      tariffs: JSON.parse(JSON.stringify(tariffs)),
      workingHours: JSON.parse(JSON.stringify(workingHours)),
    };
    
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newState);
    
    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift();
    }
    
    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
      canUndo: newHistory.length > 1,
      canRedo: false,
    });
  },

  undo: () => {
    const { historyIndex, history } = get();
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const state = history[newIndex];
      set({
        students: state.students,
        archivedStudents: state.archivedStudents,
        lessons: state.lessons,
        dailyReports: state.dailyReports,
        tariffs: state.tariffs,
        workingHours: state.workingHours,
        historyIndex: newIndex,
        canUndo: newIndex > 0,
        canRedo: true,
      });
    }
  },

  redo: () => {
    const { historyIndex, history } = get();
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const state = history[newIndex];
      set({
        students: state.students,
        archivedStudents: state.archivedStudents,
        lessons: state.lessons,
        dailyReports: state.dailyReports,
        tariffs: state.tariffs,
        workingHours: state.workingHours,
        historyIndex: newIndex,
        canUndo: true,
        canRedo: newIndex < history.length - 1,
      });
    }
  },

  // Student actions
  addStudent: async (studentData) => {
    const newStudent: Student = {
      ...studentData,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    set((state) => ({
      students: [...state.students, newStudent],
    }));
    
    await SQLite.saveStudent(newStudent);
    get()._saveToHistory();
  },

  updateStudent: async (id, updates) => {
    set((state) => ({
      students: state.students.map((s) =>
        s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
      ),
    }));
    
    const updated = get().students.find((s) => s.id === id);
    if (updated) {
      await SQLite.saveStudent(updated);
    }
    get()._saveToHistory();
  },

  deleteStudent: async (id) => {
    set((state) => ({
      students: state.students.filter((s) => s.id !== id),
    }));
    
    await SQLite.deleteStudent(id);
    get()._saveToHistory();
  },

  getStudentById: (id) => {
    return get().students.find((s) => s.id === id);
  },

  // Lesson actions
  addLesson: async (lessonData) => {
    const newLesson: Lesson = {
      ...lessonData,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    set((state) => ({
      lessons: [...state.lessons, newLesson],
    }));
    
    await SQLite.saveLesson(newLesson);
    get()._saveToHistory();
  },

  updateLesson: async (id, updates) => {
    set((state) => ({
      lessons: state.lessons.map((l) =>
        l.id === id ? { ...l, ...updates, updatedAt: new Date().toISOString() } : l
      ),
    }));
    
    const updated = get().lessons.find((l) => l.id === id);
    if (updated) {
      await SQLite.saveLesson(updated);
    }
    get()._saveToHistory();
  },

  deleteLesson: async (id) => {
    set((state) => ({
      lessons: state.lessons.filter((l) => l.id !== id),
    }));
    
    await SQLite.deleteLesson(id);
    get()._saveToHistory();
  },

  deleteLessonByStudent: async (studentId) => {
    set((state) => ({
      lessons: state.lessons.filter((l) => l.studentId !== studentId),
    }));
    
    await SQLite.deleteLessonsByStudent(studentId);
    get()._saveToHistory();
  },

  copyWeekToNext: async () => {
    const { currentWeekStart, lessons } = get();
    const weekStart = parseISO(currentWeekStart);

    // All recurring lessons from current week (including breaks & business)
    const weekLessons = lessons.filter((l) => {
      const d = parseISO(l.date);
      return isSameWeek(d, weekStart, { weekStartsOn: 1 }) && l.isRecurring;
    });
    if (weekLessons.length === 0) return 0;

    const nextWeekStart = addDays(weekStart, 7);
    const ts = new Date().toISOString();

    // Remove ALL lessons from next week so current week fully replaces it
    const toDeleteIds = new Set(
      lessons
        .filter((l) => {
          const d = parseISO(l.date);
          return isSameWeek(d, nextWeekStart, { weekStartsOn: 1 });
        })
        .map((l) => l.id)
    );

    const newLessons: Lesson[] = weekLessons.map((l) => ({
      ...l,
      id: uuidv4(),
      date: format(addDays(parseISO(l.date), 7), 'yyyy-MM-dd'),
      createdAt: ts,
      updatedAt: ts,
    }));

    if (newLessons.length === 0 && toDeleteIds.size === 0) return -1;

    const toDeleteArray = lessons.filter((l) => toDeleteIds.has(l.id));

    set((state) => ({
      lessons: [
        ...state.lessons.filter((l) => !toDeleteIds.has(l.id)),
        ...newLessons,
      ],
    }));

    for (const l of toDeleteArray) await SQLite.deleteLesson(l.id);
    for (const l of newLessons) await SQLite.saveLesson(l);
    get()._saveToHistory();
    return newLessons.length;
  },

  getLessonsByDate: (date) => {
    return get().lessons.filter((l) => l.date === date).sort((a, b) => a.time.localeCompare(b.time));
  },

  getLessonsByWeek: (weekStart) => {
    const start = parseISO(weekStart);
    return get().lessons.filter((l) => {
      const lessonDate = parseISO(l.date);
      return isSameWeek(lessonDate, start, { weekStartsOn: 1 });
    });
  },

  // Daily report actions
  addDailyReport: async (reportData) => {
    const allExisting = get().dailyReports.filter(
      (r) => r.lessonId === reportData.lessonId && r.date === reportData.date
    );
    for (const e of allExisting) {
      set((state) => ({
        dailyReports: state.dailyReports.filter((r) => r.id !== e.id),
      }));
      await SQLite.deleteDailyReport(e.id);
    }

    const newReport: DailyReport = {
      ...reportData,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
    };

    set((state) => ({
      dailyReports: [...state.dailyReports, newReport],
    }));

    await SQLite.saveDailyReport(newReport);
    get()._saveToHistory();
  },

  deleteDailyReport: async (lessonId: string, date: string) => {
    const allReports = get().dailyReports.filter(
      (r) => r.lessonId === lessonId && r.date === date
    );

    set((state) => ({
      dailyReports: state.dailyReports.filter(
        (r) => !(r.lessonId === lessonId && r.date === date)
      ),
    }));

    for (const r of allReports) {
      await SQLite.deleteDailyReport(r.id);
    }

    get()._saveToHistory();
  },

  getReportsByDate: (date) => {
    return get().dailyReports.filter((r) => r.date === date);
  },

  hasUnreportedLessons: (date: string) => {
    const reportableLessons = get().lessons.filter((l) =>
      l.date === date &&
      isUserLesson(l) &&
      !(l.isFreeSlot && !l.freeSlotReplacementId)
    );
    const reports = get().dailyReports.filter((r) => r.date === date);
    const reportedIds = new Set(reports.map((r) => r.lessonId));
    return reportableLessons.length > 0 && reportableLessons.some((l) => !reportedIds.has(l.id));
  },

  // Week management
  setCurrentWeekStart: (date) => {
    set({ currentWeekStart: date });
  },


  // Finance actions
  recordPayment: (studentId, amount, notes) => {
    const student = get().getStudentById(studentId);
    if (!student) return;

    const paymentAmount = (amount && amount > 0) ? amount : 1;
    const newBalance = student.balance + paymentAmount;

    // Add payment history
    const paymentEntry = {
      id: uuidv4(),
      amount: paymentAmount,
      date: new Date().toISOString().split('T')[0],
      notes: notes || '',
      createdAt: new Date().toISOString(),
    };

    const currentHistory = student.paymentHistory || [];

    // If student was in debt, backdate abonStart to their most recent real lesson
    // so the subscription appears to start when the old one ran out.
    // If balance is positive, keep the existing abonStart.
    let newAbonStart: string | undefined = student.abonStart;
    if (student.balance <= 0) {
      const todayStr = new Date().toISOString().split('T')[0];
      const recentLesson = get().lessons
        .filter((l) => {
          if (l.studentId !== studentId) return false;
          if (!l.date || l.date > todayStr) return false;
          if (l.isFreeSlot) return false;
          if (l.lessonType === 'single' || l.lessonType === 'one_time' || l.lessonType === 'break' || l.lessonType === 'business') return false;
          return true;
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      if (recentLesson) newAbonStart = recentLesson.date;
    }

    get().updateStudent(studentId, {
      balance: newBalance,
      lastPaymentDate: new Date().toISOString().split('T')[0],
      abonStart: newAbonStart,
      paymentHistory: [...currentHistory, paymentEntry],
    });
  },

  applyLessonCharge: (studentId, lessonDate) => {
    const student = get().getStudentById(studentId);
    if (!student) return;
    if (student.isFrozen) return;

    const tariff = get().tariffs.find(t => t.id === student.tariffId);
    const prevBalance = student.balance;
    const newBalance = prevBalance - 1;

    // Only track abonStart if tariff exists
    const updates: Partial<Student> = { balance: newBalance };
    if (tariff && lessonDate) {
      const isFirstOfCycle =
        !student.abonStart ||
        (tariff.lessons > 0 && prevBalance === tariff.lessons);
      if (isFirstOfCycle) {
        updates.abonStart = lessonDate;
      }
    }

    get().updateStudent(studentId, updates);
  },

  applyAbsenceFine: (studentId, fineAmount) => {
    const student = get().getStudentById(studentId);
    if (!student) return;
    if (student.isFrozen) return;

    const newBalance = student.balance - fineAmount;
    get().updateStudent(studentId, { balance: newBalance });
  },

  // Import/Export
  exportData: () => {
    const { students, lessons, dailyReports, tariffs, workingHours } = get();
    return JSON.stringify({
      students,
      lessons,
      dailyReports,
      tariffs,
      workingHours,
      exportDate: new Date().toISOString(),
    }, null, 2);
  },

  importData: async (jsonData) => {
    try {
      const data = JSON.parse(jsonData);

      if (!data || typeof data !== 'object') {
        throw new Error('Invalid import format: expected JSON object');
      }

      await SQLite.clearAllData();

      if (data.students && Array.isArray(data.students)) {
        const validated = (data.students as unknown[]).filter(
          (s): s is Student => typeof s === 'object' && s !== null && 'id' in s && 'fullName' in s
        );
        set({ students: validated });
        for (const s of validated) await SQLite.saveStudent(s);
      }

      if (data.lessons && Array.isArray(data.lessons)) {
        const validated = (data.lessons as unknown[]).filter(
          (l): l is Lesson => typeof l === 'object' && l !== null && 'id' in l && 'studentId' in l && 'date' in l
        );
        set({ lessons: validated });
        for (const l of validated) await SQLite.saveLesson(l);
      }

      if (data.dailyReports && Array.isArray(data.dailyReports)) {
        const validated = (data.dailyReports as unknown[]).filter(
          (r): r is DailyReport => typeof r === 'object' && r !== null && 'id' in r && 'lessonId' in r
        );
        set({ dailyReports: validated });
        for (const r of validated) await SQLite.saveDailyReport(r);
      }

      if (data.tariffs && Array.isArray(data.tariffs)) {
        const validated = (data.tariffs as unknown[]).filter(
          (t): t is Tariff => typeof t === 'object' && t !== null && 'id' in t && 'name' in t
        );
        set({ tariffs: validated });
        await SQLite.setSetting('tariffs', validated);
      }

      if (data.workingHours && typeof data.workingHours === 'object') {
        set({ workingHours: data.workingHours as WorkingHours });
        await SQLite.setSetting('workingHours', data.workingHours);
      }

      set({
        history: [],
        historyIndex: -1,
        canUndo: false,
        canRedo: false,
      });
      get()._saveToHistory();
    } catch (_error) {
      throw new Error('Failed to import data');
    }
  },

  // Tariff actions
  addTariff: (tariffData) => {
    const newTariff: Tariff = {
      ...tariffData,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ tariffs: [...state.tariffs, newTariff] }));
    SQLite.setSetting('tariffs', get().tariffs);
    get()._saveToHistory();
  },

  updateTariff: (id, updates) => {
    set((state) => ({
      tariffs: state.tariffs.map((t) => t.id === id ? { ...t, ...updates } : t),
    }));
    SQLite.setSetting('tariffs', get().tariffs);
    get()._saveToHistory();
  },

  deleteTariff: (id) => {
    set((state) => ({ tariffs: state.tariffs.filter((t) => t.id !== id) }));
    SQLite.setSetting('tariffs', get().tariffs);
    get()._saveToHistory();
  },

  // Working Hours actions
  setWorkingHours: (hours) => {
    set({ workingHours: hours });
    SQLite.setSetting('workingHours', hours);
    get()._saveToHistory();
  },

  // Theme
  setTheme: (theme) => {
    set({ theme });
    SQLite.setSetting('theme', theme);
  },

  // Schedule UI
  setScheduleScale: (scale) => {
    set({ scheduleScale: scale });
    try { localStorage.setItem('scheduleScale', String(scale)); } catch {}
  },

  // Students UI
  setStudentsScale: (scale) => {
    set({ studentsScale: scale });
  },

  // Lesson type colors
  setLessonColor: (type, color) => {
    set((state) => {
      const next = { ...state.lessonColors, [type]: color };
      try { localStorage.setItem('lessonColors', JSON.stringify(next)); } catch {}
      return { lessonColors: next };
    });
  },
  resetLessonColors: () => {
    const defaults = {
      regular:  '#f97316',
      one_time: '#9333ea',
      single:   '#16a34a',
      break:    '#22d3ee',
      business: '#f472b6',
    };
    set({ lessonColors: defaults });
    try { localStorage.removeItem('lessonColors'); } catch {}
  },

  // Custom student filters
  addCustomStudentFilter: (name) => {
    set((state) => ({
      customStudentFilters: state.customStudentFilters.includes(name)
        ? state.customStudentFilters
        : [...state.customStudentFilters, name],
    }));
    try { localStorage.setItem('customStudentFilters', JSON.stringify(get().customStudentFilters)); } catch {}
  },
  removeCustomStudentFilter: (name) => {
    set((state) => ({
      customStudentFilters: state.customStudentFilters.filter((f) => f !== name),
    }));
    try { localStorage.setItem('customStudentFilters', JSON.stringify(get().customStudentFilters)); } catch {}
  },

  // Archived students
  archiveStudent: async (id) => {
    const student = get().students.find((s) => s.id === id);
    if (!student) return;
    const archived = { ...student, archivedAt: new Date().toISOString() };
    set((state) => ({
      students: state.students.filter((s) => s.id !== id),
      archivedStudents: [...state.archivedStudents, archived],
    }));
    await SQLite.deleteLessonsByStudent(id);
    set((state) => ({ lessons: state.lessons.filter((l) => l.studentId !== id) }));
    await SQLite.deleteStudent(id);
    try { localStorage.setItem('archivedStudents', JSON.stringify(get().archivedStudents)); } catch {}
    get()._saveToHistory();
  },
  restoreStudent: async (student) => {
    const { archivedAt: _a, ...restored } = student as Student & { archivedAt?: string };
    restored.updatedAt = new Date().toISOString();
    set((state) => ({
      archivedStudents: state.archivedStudents.filter((s) => s.id !== student.id),
      students: [...state.students, restored],
    }));
    await SQLite.saveStudent(restored);
    try { localStorage.setItem('archivedStudents', JSON.stringify(get().archivedStudents)); } catch {}
    get()._saveToHistory();
  },
  deleteArchivedStudent: (id) => {
    set((state) => ({ archivedStudents: state.archivedStudents.filter((s) => s.id !== id) }));
    try { localStorage.setItem('archivedStudents', JSON.stringify(get().archivedStudents)); } catch {}
  },
}));

// Seed initial data with predefined students and schedule
const seedInitialData = async () => {
  const store = useAppStore.getState();
  
  // Check if data already exists
  if (store.students.length > 0) return;

  const mk = () => ({ progress: '', futurePlan: '', homework: '' });
  const ts = new Date().toISOString();
  const s = (name: string): Student => ({
    id: uuidv4(), fullName: name, phone: '', tariff: 0, balance: 0,
    status: 'active' as const, isRecurring: true, notes: mk(), createdAt: ts, updatedAt: ts,
  });

  // All students from the list (photo 1)
  const [
    annaAL, annaEN, artem, vladaAlisa, glebG, dianaRA, evgeniaNK,
    ekaterina, irina, kirillVM, kirillSCh, leraSTp, leraAT, levOnline,
    levDV, lyosha, marinaAK, maksimSP, mishaACh, miroslava,
    nadezhdaVE, nastya, savvaASh, timofeyD, yaroslavRS, yaroslavDK,
    radmilaSM, vyacheslav, dmitriyBCh, dmitriyVif, kirillSM, kostyaNT, tatyana,
    sofyaSZh,
  ] = [
    s('Анна А.Л.'), s('Анна Е.Н.'), s('Артём В.М.'), s('Влада и Алиса'), s('Глеб Г.'),
    s('Диана Р.А.'), s('Евгения Н.К.'), s('Екатерина А.К.'), s('Ирина Лайки'),
    s('Кирилл В.М.'), s('Кирилл С.Ч.'), s('Лера С.Т.'), s('Лера А.Т.'), s('Лев Онлайн'),
    s('Лев Д.В.'), s('Лёша'), s('Марина А.К.'), s('Максим С.П.'), s('Миша А.Ч.'),
    s('Мирослава'), s('Надежда В.Е.'), s('Настя'), s('Савва А.Ш.'), s('Тимофей Д.'),
    s('Ярослав Р.С.'), s('Ярослав Д.К.'), s('Радмила С.М.'), s('Вячеслав'),
    s('Дмитрий Б.Ч.'), s('Дмитрий Ви-ф'), s('Кирилл С.М.'), s('Костя Н.Т.'),
    s('Татьяна'), s('Софья С.Ж.'),
  ];

  // System block for breaks (not shown in student lists)
  const systemBlockId = uuidv4();
  const systemBlockStudent: Student = {
    id: systemBlockId, fullName: 'System Block', phone: '', tariff: 0, balance: 0,
    status: 'active' as const, isRecurring: true, notes: mk(), createdAt: ts, updatedAt: ts,
  };

  const allStudents: Student[] = [
    annaAL, annaEN, artem, vladaAlisa, glebG, dianaRA, evgeniaNK,
    ekaterina, irina, kirillVM, kirillSCh, leraSTp, leraAT, levOnline,
    levDV, lyosha, marinaAK, maksimSP, mishaACh, miroslava,
    nadezhdaVE, nastya, savvaASh, timofeyD, yaroslavRS, yaroslavDK,
    radmilaSM, vyacheslav, dmitriyBCh, dmitriyVif, kirillSM, kostyaNT, tatyana,
    sofyaSZh, systemBlockStudent,
  ];

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const defaultLessons: Lesson[] = [];

  // Helper: add lesson (duration in minutes, default 30)
  const L = (student: Student, dayOffset: number, time: string, ws: Date, duration = 30): Lesson => ({
    id: uuidv4(), studentId: student.id, studentName: student.fullName,
    date: format(addDays(ws, dayOffset), 'yyyy-MM-dd'),
    time, duration, status: 'scheduled' as const,
    isRecurring: true, lessonType: 'regular' as const, createdAt: ts, updatedAt: ts,
  });

  for (let weekOffset = 0; weekOffset < 5; weekOffset++) {
    const ws = addDays(weekStart, weekOffset * 7);
    // 0=Пн 1=Вт 2=Ср 3=Чт 4=Пт 5=Сб 6=Вс

    // ── Понедельник ──
    defaultLessons.push(
      L(ekaterina,   0, '11:00', ws, 90),
      L(leraSTp,     0, '14:30', ws, 60),
      L(levOnline,   0, '15:30', ws, 60),
      L(kirillVM,    0, '16:30', ws, 60),
      L(yaroslavRS,  0, '17:30', ws, 60),
      L(vladaAlisa,  0, '18:30', ws, 60),
      L(irina,       0, '19:30', ws, 60),
    );

    // ── Вторник ──
    defaultLessons.push(
      L(levDV,       1, '14:30', ws, 60),
      L(lyosha,      1, '16:30', ws, 60),
      L(glebG,       1, '17:30', ws, 60),
      L(annaEN,      1, '18:30', ws, 60),
      L(savvaASh,    1, '19:30', ws, 60),
    );

    // ── Среда ──
    defaultLessons.push(
      L(vladaAlisa,  2, '15:30', ws, 60),
      L(marinaAK,    2, '18:30', ws, 60),
      L(irina,       2, '19:30', ws, 60),
      L(artem,       2, '20:30', ws, 60),
      L(miroslava,   2, '17:30', ws, 60),
    );

    // ── Четверг ──
    defaultLessons.push(
      L(ekaterina,   3, '10:00', ws, 90),
      L(nadezhdaVE,  3, '12:00', ws, 60),
      L(levDV,       3, '14:30', ws, 60),
      L(leraSTp,     3, '15:30', ws, 60),
      L(lyosha,      3, '16:30', ws, 60),
      L(annaAL,      3, '18:30', ws, 60),
      L(kirillVM,    3, '19:30', ws, 60),
    );

    // ── Пятница ──
    defaultLessons.push(
      L(glebG,       4, '17:30', ws, 60),
      L(yaroslavRS,  4, '16:30', ws, 60),
      L(dianaRA,     4, '18:30', ws, 60),
      L(annaEN,      4, '19:30', ws, 60),
      L(maksimSP,    4, '20:30', ws, 60),
    );

    // ── Суббота ──
    defaultLessons.push(
      L(lyosha,      5, '10:00', ws, 60),
      L(leraAT,      5, '11:00', ws, 60),
      L(yaroslavDK,  5, '12:00', ws, 60),
      L(marinaAK,    5, '13:00', ws, 60),
      L(savvaASh,    5, '16:00', ws, 60),
      L(levOnline,   5, '17:00', ws, 60),
      L(artem,       5, '18:30', ws, 60),
    );

    // ── Воскресенье ──
    defaultLessons.push(
      L(artem,       6, '10:00', ws, 60),
      L(timofeyD,    6, '11:00', ws, 60),
      L(dianaRA,     6, '12:00', ws, 60),
      L(mishaACh,    6, '13:00', ws, 60),
      L(nastya,      6, '14:00', ws, 60),
    );

    // ── Перерывы Пн-Пт 13:00-14:00 ──
    for (let day = 0; day < 5; day++) {
      defaultLessons.push({
        id: uuidv4(), studentId: systemBlockId, studentName: 'Перерыв',
        date: format(addDays(ws, day), 'yyyy-MM-dd'),
        time: '13:00', duration: 60, status: 'scheduled' as const,
        isRecurring: true, lessonType: 'break' as const, createdAt: ts, updatedAt: ts,
      });
    }
  }
  
  // Save to SQLite
  for (const student of allStudents) {
    await SQLite.saveStudent(student);
  }
  for (const lesson of defaultLessons) {
    await SQLite.saveLesson(lesson);
  }
  await SQLite.setSetting('tariffs', defaultTariffs);
  await SQLite.setSetting('workingHours', defaultWorkingHours);
  
  // Update store
  useAppStore.setState({
    students: allStudents,
    lessons: defaultLessons,
    dailyReports: [],
    tariffs: defaultTariffs,
    workingHours: defaultWorkingHours,
    history: [{ students: allStudents, archivedStudents: [], lessons: defaultLessons, dailyReports: [], tariffs: defaultTariffs, workingHours: defaultWorkingHours }],
    historyIndex: 0,
    canUndo: false,
    canRedo: false,
  });
};

// Initialize store with data from SQLite
export const initializeStore = async () => {
  // Prevent double initialization (e.g. when switching tabs)
  if (useAppStore.getState().isInitialized) return;

  await SQLite.initSQLite();

  const [students, lessons, dailyReports, tariffs, workingHours, theme] = await Promise.all([
    SQLite.getStudents(),
    SQLite.getLessons(),
    SQLite.getDailyReports(),
    SQLite.getSetting<typeof defaultTariffs>('tariffs', defaultTariffs),
    SQLite.getSetting<typeof defaultWorkingHours>('workingHours', defaultWorkingHours),
    SQLite.getSetting<'neon' | 'brand' | 'ocean' | 'forest' | 'sunset' | 'midnight' | 'cherry' | 'mint' | 'gold' | 'lavender' | 'coffee' | 'nordic' | 'rose' | 'cyber' | 'autumn' | 'winter' | 'sakura' | 'neonpink' | 'matrix' | 'amoled' | 'retro' | 'bubblegum' | 'slate' | 'mocha'>('theme', 'neon'),
  ]);

  // If no data, seed initial data
  if (students.length === 0) {
    await seedInitialData();
    useAppStore.setState({ isInitialized: true, theme, scheduleScale: 1 });
    return;
  }

  let scheduleScale = 1;
  let studentsScale = 0.6;
  try {
    const ss = localStorage.getItem('scheduleScale');
    if (ss && parseFloat(ss) >= 1) scheduleScale = parseFloat(ss);
    const st = localStorage.getItem('studentsScale');
    if (st) studentsScale = parseFloat(st);
  } catch {}
  let customStudentFilters: string[] = [];
  let archivedStudents: Student[] = [];
  let lessonColors: Record<string, string> = {
    regular:  '#f97316',
    one_time: '#9333ea',
    single:   '#16a34a',
    break:    '#22d3ee',
    business: '#f472b6',
  };
  try {
    const csf = localStorage.getItem('customStudentFilters');
    if (csf) {
      // Strip old built-in names that were previously stored as custom filters
      const obsolete = ['Только вечер', 'Любое время'];
      const parsed: string[] = JSON.parse(csf);
      customStudentFilters = parsed.filter(f => !obsolete.includes(f));
      localStorage.setItem('customStudentFilters', JSON.stringify(customStudentFilters));
    }
    const arch = localStorage.getItem('archivedStudents');
    if (arch) archivedStudents = JSON.parse(arch);
    const lc = localStorage.getItem('lessonColors');
    if (lc) lessonColors = { ...lessonColors, ...JSON.parse(lc) };
  } catch {}

  // Purge orphan lessons — studentId not found in students and not a system/single lesson
  const studentIdSet = new Set(students.map((s) => s.id));
  const orphanLessons = lessons.filter(
    (l) => !studentIdSet.has(l.studentId) && l.studentId !== SYSTEM_STUDENT_ID
  );
  if (orphanLessons.length > 0) {
    console.warn(`[initializeStore] Purging ${orphanLessons.length} orphan lessons`);
    for (const l of orphanLessons) SQLite.deleteLesson(l.id);
  }
  const cleanLessons = orphanLessons.length > 0
    ? lessons.filter((l) => studentIdSet.has(l.studentId) || l.studentId === SYSTEM_STUDENT_ID)
    : lessons;

  useAppStore.setState({
    students,
    lessons: cleanLessons,
    dailyReports,
    tariffs,
    workingHours,
    theme,
    scheduleScale,
    studentsScale,
    lessonColors,
    customStudentFilters,
    archivedStudents,
    history: [{ students, archivedStudents, lessons: cleanLessons, dailyReports, tariffs, workingHours }],
    historyIndex: 0,
    canUndo: false,
    canRedo: false,
    isInitialized: true,
  });
};
