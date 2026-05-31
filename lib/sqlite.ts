import { Capacitor } from '@capacitor/core';
import type { Student, Lesson, DailyReport, Tariff, WorkingHours } from '@/types';

// SQLite will be loaded dynamically for native platforms
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlitePlugin: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dbConnection: any = null;

const isNative = Capacitor.isNativePlatform();

export async function initSQLite() {
  if (!isNative) {
    // Web platform - using localStorage fallback
    return false;
  }

  try {
    const { CapacitorSQLite } = await import('@capacitor-community/sqlite');
    sqlitePlugin = CapacitorSQLite;
    
    const result = await sqlitePlugin.createConnection({
      database: 'guitar_planner.db',
    });
    dbConnection = result;
    
    await dbConnection.open();
    await createTables();
    // SQLite initialized successfully
    return true;
  } catch (error) {
    // SQLite initialization failed
    return false;
  }
}

async function createTables() {
  if (!dbConnection) return;

  const createStudentsTable = `
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      fullName TEXT NOT NULL,
      phone TEXT,
      tariff INTEGER DEFAULT 0,
      tariffId TEXT DEFAULT '',
      balance INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      isRecurring INTEGER DEFAULT 1,
      notes TEXT DEFAULT '{}',
      tariffHistory TEXT DEFAULT '[]',
      paymentHistory TEXT DEFAULT '[]',
      isFrozen INTEGER DEFAULT 0,
      freezeFrom TEXT DEFAULT '',
      freezeTo TEXT DEFAULT '',
      lastFreezeMonth TEXT DEFAULT '',
      lastPaymentDate TEXT DEFAULT '',
      hasReview INTEGER DEFAULT 0,
      section TEXT DEFAULT '',
      sections TEXT DEFAULT '[]',
      archivedAt TEXT DEFAULT '',
      createdAt TEXT,
      updatedAt TEXT
    );
  `;

  const createLessonsTable = `
    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      studentId TEXT NOT NULL,
      studentName TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      duration INTEGER DEFAULT 30,
      status TEXT DEFAULT 'scheduled',
      isRecurring INTEGER DEFAULT 1,
      lessonType TEXT DEFAULT 'regular',
      notes TEXT DEFAULT '',
      isFreeSlot INTEGER DEFAULT 0,
      freeSlotReplacementId TEXT DEFAULT '',
      rescheduledFrom TEXT DEFAULT '',
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (studentId) REFERENCES students(id) ON DELETE CASCADE
    );
  `;

  const createReportsTable = `
    CREATE TABLE IF NOT EXISTS daily_reports (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      lessonId TEXT NOT NULL,
      studentId TEXT NOT NULL,
      status TEXT NOT NULL,
      newDate TEXT,
      freezeUntil TEXT,
      fineAmount INTEGER,
      createdAt TEXT
    );
  `;

  const createSettingsTable = `
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `;

  await dbConnection.execute({ statements: createStudentsTable });
  await dbConnection.execute({ statements: createLessonsTable });
  await dbConnection.execute({ statements: createReportsTable });
  await dbConnection.execute({ statements: createSettingsTable });

  // Migration: remove ON DELETE CASCADE from daily_reports (was deleting reports on lesson re-save)
  // Only run if daily_reports_new doesn't already exist as that indicates migration in progress
  try {
    const tableCheck = await dbConnection.query({ statement: `SELECT name FROM sqlite_master WHERE type='table' AND name='daily_reports_new';`, values: [] });
    const migrationPending = tableCheck.values && tableCheck.values.length > 0;
    if (migrationPending) {
      // Clean up orphaned temp table from previous failed migration
      await dbConnection.execute({ statements: `DROP TABLE IF EXISTS daily_reports_new;` });
    }
    // Check if daily_reports still has ON DELETE CASCADE by inspecting its SQL
    const schemaCheck = await dbConnection.query({ statement: `SELECT sql FROM sqlite_master WHERE type='table' AND name='daily_reports';`, values: [] });
    const hasCascade = schemaCheck.values && schemaCheck.values[0]?.sql?.includes('ON DELETE CASCADE');
    if (hasCascade) {
      await dbConnection.execute({ statements: `
        CREATE TABLE daily_reports_new (
          id TEXT PRIMARY KEY,
          date TEXT NOT NULL,
          lessonId TEXT NOT NULL,
          studentId TEXT NOT NULL,
          status TEXT NOT NULL,
          newDate TEXT,
          freezeUntil TEXT,
          fineAmount INTEGER,
          createdAt TEXT
        );
      `});
      await dbConnection.execute({ statements: `INSERT OR IGNORE INTO daily_reports_new SELECT id, date, lessonId, studentId, status, newDate, freezeUntil, fineAmount, createdAt FROM daily_reports;` });
      await dbConnection.execute({ statements: `DROP TABLE daily_reports;` });
      await dbConnection.execute({ statements: `ALTER TABLE daily_reports_new RENAME TO daily_reports;` });
    }
  } catch (_) { /* already migrated or first install */ }

  const migrations = [
    `ALTER TABLE students ADD COLUMN tariffId TEXT DEFAULT '';`,
    `ALTER TABLE students ADD COLUMN tariffHistory TEXT DEFAULT '[]';`,
    `ALTER TABLE students ADD COLUMN paymentHistory TEXT DEFAULT '[]';`,
    `ALTER TABLE lessons ADD COLUMN isFreeSlot INTEGER DEFAULT 0;`,
    `ALTER TABLE lessons ADD COLUMN freeSlotReplacementId TEXT DEFAULT '';`,
    `ALTER TABLE students ADD COLUMN isFrozen INTEGER DEFAULT 0;`,
    `ALTER TABLE students ADD COLUMN freezeFrom TEXT DEFAULT '';`,
    `ALTER TABLE students ADD COLUMN freezeTo TEXT DEFAULT '';`,
    `ALTER TABLE students ADD COLUMN lastFreezeMonth TEXT DEFAULT '';`,
    `ALTER TABLE students ADD COLUMN lastPaymentDate TEXT DEFAULT '';`,
    `ALTER TABLE students ADD COLUMN hasReview INTEGER DEFAULT 0;`,
    `ALTER TABLE students ADD COLUMN abonStart TEXT DEFAULT '';`,
    `ALTER TABLE lessons ADD COLUMN description TEXT DEFAULT '';`,
    `ALTER TABLE students ADD COLUMN section TEXT DEFAULT '';`,
    `ALTER TABLE students ADD COLUMN sections TEXT DEFAULT '[]';`,
    `ALTER TABLE students ADD COLUMN archivedAt TEXT DEFAULT '';`,
    `ALTER TABLE lessons ADD COLUMN rescheduledFrom TEXT DEFAULT '';`,
  ];
  for (const sql of migrations) {
    try {
      await dbConnection.execute({ statements: sql });
    } catch (_) {
      // Column already exists — safe to ignore
    }
  }
}

// Students
export async function getStudents(): Promise<Student[]> {
  if (!dbConnection) {
    try {
      // Check for localStorage availability in mobile environment
      if (typeof window !== 'undefined') {
        const testKey = '__test_storage__';
        try {
          window.localStorage.setItem(testKey, 'test');
          window.localStorage.removeItem(testKey);
          const data = window.localStorage.getItem('students');
          return data ? JSON.parse(data) : [];
        } catch (storageError) {
          // localStorage not available, using empty array
          return [];
        }
      }
    } catch (error) {
      // Error reading students from localStorage
    }
    return [];
  }

  const result = await dbConnection.query({
    statement: 'SELECT * FROM students ORDER BY fullName ASC;',
    values: [],
  });

  return result.values?.map((row: any) => ({
    ...row,
    isRecurring: Boolean(row.isRecurring),
    isFrozen: Boolean(row.isFrozen),
    hasReview: Boolean(row.hasReview),
    freezeFrom: row.freezeFrom || undefined,
    freezeTo: row.freezeTo || undefined,
    lastFreezeMonth: row.lastFreezeMonth || undefined,
    lastPaymentDate: row.lastPaymentDate || undefined,
    abonStart: row.abonStart || undefined,
    section: row.section || undefined,
    sections: row.sections ? JSON.parse(row.sections) : undefined,
    archivedAt: row.archivedAt || undefined,
    notes: JSON.parse(row.notes || '{}'),
    tariffHistory: JSON.parse(row.tariffHistory || '[]'),
    paymentHistory: JSON.parse(row.paymentHistory || '[]'),
  })) || [];
}

export async function saveStudent(student: Student): Promise<void> {
  if (dbConnection) {
    await dbConnection.execute({ statements: 'PRAGMA foreign_keys = OFF;' }).catch(() => {});
  }
  if (!dbConnection) {
    const students = await getStudents();
    const existingIndex = students.findIndex(s => s.id === student.id);
    if (existingIndex >= 0) {
      students[existingIndex] = student;
    } else {
      students.push(student);
    }
    localStorage.setItem('students', JSON.stringify(students));
    return;
  }

  await dbConnection.run({
    statement: `
      INSERT OR REPLACE INTO students (id, fullName, phone, tariff, tariffId, balance, status, isRecurring, notes, tariffHistory, paymentHistory, isFrozen, freezeFrom, freezeTo, lastFreezeMonth, lastPaymentDate, abonStart, hasReview, section, sections, archivedAt, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    values: [
      student.id,
      student.fullName,
      student.phone,
      student.tariff,
      student.tariffId || '',
      student.balance,
      student.status,
      student.isRecurring ? 1 : 0,
      JSON.stringify(student.notes),
      JSON.stringify(student.tariffHistory || []),
      JSON.stringify(student.paymentHistory || []),
      student.isFrozen ? 1 : 0,
      student.freezeFrom || '',
      student.freezeTo || '',
      student.lastFreezeMonth || '',
      student.lastPaymentDate || '',
      student.abonStart || '',
      student.hasReview ? 1 : 0,
      student.section || '',
      JSON.stringify(student.sections || []),
      student.archivedAt || '',
      student.createdAt,
      student.updatedAt,
    ],
  });
}

export async function deleteStudent(id: string): Promise<void> {
  if (!dbConnection) {
    const students = await getStudents();
    const filtered = students.filter(s => s.id !== id);
    localStorage.setItem('students', JSON.stringify(filtered));
    return;
  }

  await dbConnection.run({
    statement: 'DELETE FROM students WHERE id = ?;',
    values: [id],
  });
}

// Lessons
export async function getLessons(): Promise<Lesson[]> {
  if (!dbConnection) {
    try {
      // Check for localStorage availability in mobile environment
      if (typeof window !== 'undefined') {
        const testKey = '__test_storage__';
        try {
          window.localStorage.setItem(testKey, 'test');
          window.localStorage.removeItem(testKey);
          const data = window.localStorage.getItem('lessons');
          return data ? JSON.parse(data) : [];
        } catch (storageError) {
          // localStorage not available, using empty array
          return [];
        }
      }
    } catch (error) {
      // Error reading lessons from localStorage
    }
    return [];
  }

  const result = await dbConnection.query({
    statement: 'SELECT * FROM lessons ORDER BY date ASC, time ASC;',
    values: [],
  });

  return result.values?.map((row: any) => ({
    ...row,
    isRecurring: row.isRecurring === 1,
    duration: row.duration || 30,
    lessonType: row.lessonType || 'regular',
    notes: row.notes || '',
    isFreeSlot: Boolean(row.isFreeSlot),
    freeSlotReplacementId: row.freeSlotReplacementId || undefined,
    rescheduledFrom: row.rescheduledFrom || undefined,
    description: row.description || undefined,
  })) || [];
}

export async function saveLesson(lesson: Lesson): Promise<void> {
  if (!dbConnection) {
    const lessons = JSON.parse(localStorage.getItem('lessons') || '[]');
    const existingIndex = lessons.findIndex((l: Lesson) => l.id === lesson.id);
    if (existingIndex >= 0) {
      lessons[existingIndex] = lesson;
    } else {
      lessons.push(lesson);
    }
    localStorage.setItem('lessons', JSON.stringify(lessons));
    return;
  }

  // Disable foreign keys to prevent ON DELETE CASCADE from removing daily_reports
  await dbConnection.execute({ statements: 'PRAGMA foreign_keys = OFF;' }).catch(() => {});
  const statement = `
    INSERT OR REPLACE INTO lessons (id, studentId, studentName, date, time, duration, status, isRecurring, lessonType, notes, description, isFreeSlot, freeSlotReplacementId, rescheduledFrom, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `;

  await dbConnection.run({
    statement,
    values: [
      lesson.id,
      lesson.studentId,
      lesson.studentName,
      lesson.date,
      lesson.time,
      lesson.duration,
      lesson.status,
      lesson.isRecurring ? 1 : 0,
      lesson.lessonType || 'regular',
      lesson.notes || '',
      lesson.description || '',
      lesson.isFreeSlot ? 1 : 0,
      lesson.freeSlotReplacementId || '',
      lesson.rescheduledFrom || '',
      lesson.createdAt,
      lesson.updatedAt,
    ],
  });
}

export async function deleteLesson(id: string): Promise<void> {
  if (!dbConnection) {
    const lessons = await getLessons();
    const filtered = lessons.filter(l => l.id !== id);
    localStorage.setItem('lessons', JSON.stringify(filtered));
    return;
  }

  await dbConnection.run({
    statement: 'DELETE FROM lessons WHERE id = ?;',
    values: [id],
  });
}

export async function deleteLessonsByStudent(studentId: string): Promise<void> {
  if (!dbConnection) {
    const lessons = await getLessons();
    const filtered = lessons.filter(l => l.studentId !== studentId);
    localStorage.setItem('lessons', JSON.stringify(filtered));
    return;
  }

  await dbConnection.run({
    statement: 'DELETE FROM lessons WHERE studentId = ?;',
    values: [studentId],
  });
}

// Daily Reports
export async function getDailyReports(): Promise<DailyReport[]> {
  if (!dbConnection) {
    try {
      // Check for localStorage availability in mobile environment
      if (typeof window !== 'undefined') {
        const testKey = '__test_storage__';
        try {
          window.localStorage.setItem(testKey, 'test');
          window.localStorage.removeItem(testKey);
          const data = window.localStorage.getItem('dailyReports');
          return data ? JSON.parse(data) : [];
        } catch (storageError) {
          // localStorage not available, using empty array
          return [];
        }
      }
    } catch (error) {
      // Error reading dailyReports from localStorage
    }
    return [];
  }

  try {
    const result = await dbConnection.query({
      statement: 'SELECT * FROM daily_reports ORDER BY date DESC;',
      values: [],
    });
    return (result.values || []) as DailyReport[];
  } catch (error) {
    // SQLite error in getDailyReports
    return [];
  }
}

export async function saveDailyReport(report: DailyReport): Promise<void> {
  try {
    if (!dbConnection) {
      const reports = await getDailyReports();
      const existingIndex = reports.findIndex(r => r.id === report.id);
      if (existingIndex >= 0) {
        reports[existingIndex] = report;
      } else {
        reports.push(report);
      }
      localStorage.setItem('dailyReports', JSON.stringify(reports));
      return;
    }

    await dbConnection.run({
      statement: `
        INSERT OR REPLACE INTO daily_reports (id, date, lessonId, studentId, status, newDate, freezeUntil, fineAmount, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
      `,
      values: [
        report.id,
        report.date,
        report.lessonId,
        report.studentId,
        report.status,
        report.newDate || '',
        report.freezeUntil || '',
        report.fineAmount ?? 0,
        report.createdAt,
      ],
    });
  } catch (error) {
    // SQLite error in saveDailyReport
  }
}

export async function deleteDailyReport(id: string): Promise<void> {
  try {
    if (!dbConnection) {
      const reports = await getDailyReports();
      const filtered = reports.filter(r => r.id !== id);
      localStorage.setItem('dailyReports', JSON.stringify(filtered));
      return;
    }

    await dbConnection.run({
      statement: 'DELETE FROM daily_reports WHERE id = ?;',
      values: [id],
    });
  } catch (error) {
    // SQLite error in deleteDailyReport
  }
}

// Settings (tariffs, workingHours)
export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  if (!dbConnection) {
    try {
      // Check for localStorage availability in mobile environment
      if (typeof window !== 'undefined') {
        const testKey = '__test_storage__';
        try {
          window.localStorage.setItem(testKey, 'test');
          window.localStorage.removeItem(testKey);
          const raw = window.localStorage.getItem(key);
          return raw ? (JSON.parse(raw) as T) : defaultValue;
        } catch (storageError) {
          // localStorage not available, using default value
          return defaultValue;
        }
      }
    } catch (error) {
      // Error reading setting from localStorage
    }
    return defaultValue;
  }
  const result = await dbConnection.query({
    statement: 'SELECT value FROM settings WHERE key = ?;',
    values: [key],
  });
  const row = result.values?.[0];
  return row ? (JSON.parse(row.value as string) as T) : defaultValue;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  if (!dbConnection) {
    localStorage.setItem(key, JSON.stringify(value));
    return;
  }
  await dbConnection.run({
    statement: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);',
    values: [key, JSON.stringify(value)],
  });
}

// Import/Export
export async function exportAllData(): Promise<string> {
  const students = await getStudents();
  const lessons = await getLessons();
  const reports = await getDailyReports();
  
  return JSON.stringify({
    students,
    lessons,
    dailyReports: reports,
    exportDate: new Date().toISOString(),
  }, null, 2);
}

export async function clearAllData(): Promise<void> {
  if (!dbConnection) {
    localStorage.removeItem('students');
    localStorage.removeItem('lessons');
    localStorage.removeItem('dailyReports');
    return;
  }
  await dbConnection.execute({ statements: 'DELETE FROM daily_reports; DELETE FROM lessons; DELETE FROM students;' });
}

export async function importAllData(jsonData: string): Promise<void> {
  const data = JSON.parse(jsonData);
  await clearAllData();
  if (data.students) {
    for (const s of data.students) {
      await saveStudent(s);
    }
  }
  if (data.lessons) {
    for (const l of data.lessons) {
      await saveLesson(l);
    }
  }
  if (data.dailyReports) {
    for (const r of data.dailyReports) {
      await saveDailyReport(r);
    }
  }
}
