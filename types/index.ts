export type StudentStatus = 'active' | 'reserve' | 'left';
export type LessonStatus = 'scheduled' | 'present' | 'absent' | 'rescheduled' | 'frozen' | 'closed';
export type LessonType = 'regular' | 'single' | 'one_time' | 'break' | 'business';
export type ReportStatus = 'present' | 'absent' | 'rescheduled' | 'frozen';

export interface Tariff {
  id: string;
  name: string;
  lessons: number;
  price: number;
  createdAt: string;
}

export interface TariffHistory {
  tariffId: string;
  name: string;
  lessons: number;
  price: number;
  fromDate: string;
  toDate?: string;
}

export interface StudentNotes {
  progress: string;
  futurePlan: string;
  homework: string;
}

export interface PaymentHistory {
  id: string;
  amount: number;
  date: string;
  notes?: string;
  createdAt: string;
}

export interface Student {
  id: string;
  fullName: string;
  phone: string;
  tariff: number;
  tariffId?: string;
  balance: number;
  status: StudentStatus;
  isRecurring: boolean;
  notes: StudentNotes;
  tariffHistory?: TariffHistory[];
  paymentHistory?: PaymentHistory[];
  // New fields for student table
  lastPaymentDate?: string;
  abonStart?: string;       // ISO date of first reported lesson in current subscription
  isFrozen?: boolean;
  freezeFrom?: string;     // ISO date string — start of freeze
  freezeTo?: string;       // ISO date string — end of freeze (if known)
  lastFreezeMonth?: string; // "YYYY-MM" — month when last freeze was initiated
  hasReview?: boolean;
  studyStart?: string;   // user-entered, e.g. '22.08.26'
  birthday?: string;     // user-entered, e.g. '22 января'
  section?: string;
  sections?: string[];  // multiple filter zones
  archivedAt?: string; // set when soft-deleted
  createdAt: string;
  updatedAt: string;
}

export interface WorkingHours {
  enabled: boolean;
  startHour: number;
  endHour: number;
}

export interface Lesson {
  id: string;
  studentId: string;
  studentName: string;
  date: string;
  time: string;
  duration: number;
  status: LessonStatus;
  isRecurring: boolean;
  lessonType: LessonType;
  notes?: string;
  description?: string;
  isFreeSlot?: boolean;
  freeSlotReplacementId?: string;
  rescheduledFrom?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyReport {
  id: string;
  date: string;
  lessonId: string;
  studentId: string;
  status: ReportStatus;
  newDate?: string;
  freezeUntil?: string;
  fineAmount?: number;
  createdAt: string;
}

export interface AppState {
  // Students
  students: Student[];
  addStudent: (student: Omit<Student, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateStudent: (id: string, updates: Partial<Student>) => void;
  deleteStudent: (id: string) => void;
  getStudentById: (id: string) => Student | undefined;

  // Lessons
  lessons: Lesson[];
  addLesson: (lesson: Omit<Lesson, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateLesson: (id: string, updates: Partial<Lesson>) => void;
  deleteLesson: (id: string) => void;
  deleteLessonByStudent: (studentId: string) => void;
  getLessonsByDate: (date: string) => Lesson[];
  getLessonsByWeek: (weekStart: string) => Lesson[];

  // Daily Reports
  dailyReports: DailyReport[];
  addDailyReport: (report: Omit<DailyReport, 'id' | 'createdAt'>) => void;
  deleteDailyReport: (lessonId: string, date: string) => void;
  getReportsByDate: (date: string) => DailyReport[];
  hasUnreportedLessons: (date: string) => boolean;

  // Week Management
  currentWeekStart: string;
  setCurrentWeekStart: (date: string) => void;
  copyWeekToNext: () => Promise<number>;

  // Finances
  recordPayment: (studentId: string, amount?: number, notes?: string) => void;
  applyLessonCharge: (studentId: string, lessonDate?: string) => void;
  applyAbsenceFine: (studentId: string, fineAmount: number) => void;

  // Tariffs
  tariffs: Tariff[];
  addTariff: (tariff: Omit<Tariff, 'id' | 'createdAt'>) => void;
  updateTariff: (id: string, updates: Partial<Tariff>) => void;
  deleteTariff: (id: string) => void;

  // Working Hours
  workingHours: WorkingHours;
  setWorkingHours: (hours: WorkingHours) => void;

  // Import/Export
  exportData: () => string;
  importData: (jsonData: string) => void;

  // Undo/Redo
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // Initialization
  isInitialized: boolean;

  // Theme - 26 total themes
  theme: 'neon' | 'brand' | 'ocean' | 'forest' | 'sunset' | 'midnight' | 'cherry' | 'mint' | 'gold' | 'lavender' | 'coffee' | 'nordic' | 'rose' | 'cyber' | 'autumn' | 'winter' | 'sakura' | 'neonpink' | 'matrix' | 'amoled' | 'retro' | 'bubblegum' | 'slate' | 'mocha';
  setTheme: (theme: 'neon' | 'brand' | 'ocean' | 'forest' | 'sunset' | 'midnight' | 'cherry' | 'mint' | 'gold' | 'lavender' | 'coffee' | 'nordic' | 'rose' | 'cyber' | 'autumn' | 'winter' | 'sakura' | 'neonpink' | 'matrix' | 'amoled' | 'retro' | 'bubblegum' | 'slate' | 'mocha') => void;

  // Schedule UI state
  scheduleScale: number;
  setScheduleScale: (scale: number) => void;

  // Students UI state
  studentsScale: number;
  setStudentsScale: (scale: number) => void;

  // Lesson type colors (hex)
  lessonColors: Record<string, string>;
  setLessonColor: (type: string, color: string) => void;
  resetLessonColors: () => void;

  // Custom student filters
  customStudentFilters: string[];
  addCustomStudentFilter: (name: string) => void;
  removeCustomStudentFilter: (name: string) => void;

  // Archived students
  archivedStudents: Student[];
  archiveStudent: (id: string) => void;
  restoreStudent: (student: Student) => void;
  deleteArchivedStudent: (id: string) => void;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
}

export interface ToastState {
  toasts: Toast[];
  showToast: (message: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
  hideToast: (id: string) => void;
}

export type TabType = 'schedule' | 'students' | 'tasks' | 'stats' | 'finance' | 'settings';

export const SYSTEM_STUDENT_ID = 'system';
export const SYSTEM_STUDENT_NAMES = ['Перерыв', 'System Block'];
export const NON_BILLABLE_LESSON_TYPES: LessonType[] = ['break', 'business'];

export function isUserLesson(lesson: Pick<Lesson, 'lessonType' | 'studentId' | 'studentName' | 'isFreeSlot'>): boolean {
  return (
    !NON_BILLABLE_LESSON_TYPES.includes(lesson.lessonType) &&
    lesson.studentId !== SYSTEM_STUDENT_ID &&
    !SYSTEM_STUDENT_NAMES.includes(lesson.studentName) &&
    !lesson.isFreeSlot
  );
}
