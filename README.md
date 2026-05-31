# Guitar Teacher Planner

A professional mobile-first application for music teachers to manage students, schedule lessons, track payments, and monitor progress. Built as a Progressive Web App (PWA) with native Android APK support via Capacitor.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router, static export) |
| Language | TypeScript |
| Styling | Tailwind CSS + custom Glassmorphism / Neon UI |
| State Management | Zustand (with undo/redo history, 30 steps) |
| Mobile | Capacitor 6 (Android APK) |
| Database | Capacitor SQLite (native) / localStorage (web fallback) |
| Icons | Lucide React |
| Date utilities | date-fns |

---

## Features

### Schedule (Calendar)
- Weekly calendar grid with 30-minute slots (10:00 – 21:00)
- Pinch-to-zoom (50% – 200% scale) on mobile
- Long-press to add a lesson to any time slot
- Tap a lesson to edit or open the daily report
- Week navigation (prev / next)
- Copy entire week schedule to the next week
- Free slots (replacement lessons for rescheduled ones)
- Lesson types: regular, one-time, single, break, business

### Daily Report System
- Mark each lesson: **Present**, **Absent**, **Rescheduled**, **Frozen**
- Automatic balance deduction on present/absent
- Penalty system for absences (configurable)
- Rescheduled lessons create a free replacement slot
- Frozen lessons do not consume balance
- Full history log per student

### Students Management
- Student list sorted alphabetically (А–Я)
- Filter tabs: Regular, Evening, Any Time, Frozen, Reserve + custom sections
- Inline editable table: name, phone, tariff, balance, subscription dates, review, study start date
- Student card (modal): full profile, lesson history, notes, home tasks, voice input
- Balance chip with color coding (green / amber / red)
- Subscription start & end dates — only shown when student has lessons in schedule
- Freeze / unfreeze students
- Student sections (custom tags) for grouping

### Tariffs & Payments
- Configurable tariffs: name, number of lessons, price
- Payment recorded as number of lessons purchased
- Income calculated per full subscription (not per lesson)
- Payment history per student with dates

### Finance Dashboard
- Periods: Week, Month, Year
- **Income** — actual received payments (full tariff price)
- **Expected** — projected revenue until end of period
- **Unpaid** — outstanding balance per active student
- **Total** — Income + Expected
- Breakdown by student with expand/collapse
- Monthly bar chart of income

### Statistics
- Lesson count charts (week / month / year)
- Student activity overview
- Revenue trends

### Tasks (To-Do)
- Categories (sections) with swipe navigation
- Levels (groups) within each category — color coded with emoji
- Tasks with title, details, due date/time, daily repeat
- Local notifications for task reminders
- Drag-and-drop reordering of tasks and levels
- Progress bar per category (done / total)

### Settings
- 24 color themes (Neon, Ocean, Forest, Sunset, Midnight, Cherry, etc.)
- Custom tab bar icons (emoji)
- Working hours configuration
- Export / Import all data as JSON
- Undo / Redo (30 steps)
- App version info

---

## Project Structure

```
├── app/
│   ├── globals.css          # Tailwind base + custom neon/glass styles
│   ├── layout.tsx           # Root layout with metadata
│   └── page.tsx             # Entry point — initializes store, renders tabs
├── components/
│   ├── Schedule.tsx         # Weekly calendar with pinch-zoom
│   ├── LessonModal.tsx      # Add/edit lesson modal
│   ├── DailyReportModal.tsx # Daily report (present/absent/reschedule/freeze)
│   ├── Students.tsx         # Student list table with filters
│   ├── StudentModal.tsx     # Student profile card
│   ├── Finance.tsx          # Finance dashboard
│   ├── Stats.tsx            # Statistics charts
│   ├── Tasks.tsx            # To-do list with categories and levels
│   ├── Settings.tsx         # App settings
│   ├── LearningHistory.tsx  # Per-student lesson history
│   ├── TabBar.tsx           # Bottom navigation bar
│   ├── SwipeTabs.tsx        # Swipeable tab content wrapper
│   └── Toast.tsx            # Toast notifications
├── store/
│   ├── appStore.ts          # Main Zustand store (students, lessons, reports, tariffs)
│   └── toastStore.ts        # Toast notification store
├── lib/
│   ├── sqlite.ts            # SQLite wrapper (native) with localStorage fallback
│   ├── expectedRevenue.ts   # Revenue forecast calculations
│   ├── defaultEmojis.ts     # Default emoji sets
│   └── notifications.ts     # Local notification helpers
├── types/
│   └── index.ts             # All TypeScript interfaces and types
├── tailwind.config.ts       # Tailwind config with custom neon colors
├── next.config.mjs          # Next.js static export config
└── capacitor.config.ts      # Capacitor app config
```

---

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
# Open http://localhost:3000
```

## Build Android APK

```bash
# 1. Build Next.js static export
npm run build

# 2. Sync web assets to Android project
npx cap sync android

# 3. Build debug APK
cd android
.\gradlew assembleDebug

# Output: android/app/build/outputs/apk/debug/app-debug.apk
```

---

## License

MIT
