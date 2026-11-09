This means zero hosting or server costs, and student data stays under the teacher's control on their own device.

---

## Tech Stack

Frontend & UI
- TypeScript (strict mode)
- React 19
- React Router DOM 7 (with lazy loading)
- Tailwind CSS 3
- Lucide React (icons)
- Cairo font (Arabic support)

Database & Data Management
- IndexedDB
- Dexie.js 4
- dexie-react-hooks (useLiveQuery for reactive UI updates)

Progressive Web App
- Vite
- vite-plugin-pwa
- Workbox
- Service Worker
- Web App Manifest

Reports & Export
- pdfmake-rtl (PDF generation with RTL support)
- Cairo TTF embedded in PDFs
- CSV export with protection against Excel formula injection
- JSON backup and restore with structural validation

Testing & Deployment
- Vitest
- fake-indexeddb
- Vercel and Netlify (with SPA redirect configuration)

---

## Architecture

The project is organized into layers that separate responsibilities instead of placing all logic inside React components:

src/
├── db/          # Database schema and data access repositories (3 schema versions)
├── services/    # Business logic: attendance, grades, ranking, backup, reports
├── hooks/       # Bridge between data logic and the UI
├── components/  # Reusable UI components
├── pages/       # Application pages
├── utils/       # Date handling, CSV, Arabic name normalization, number parsing
└── types/       # TypeScript types and interfaces
### Database

Six main tables:

Students, AttendanceDays, AttendanceRecords, Settings, Assessments, Grades

Compound indexes and unique constraints (such as [dayId+studentId]) prevent duplicate attendance records for the same student on the same day.

### Key Engineering Decisions
- Ranking logic as a pure function: the Ranking Service is isolated from the UI, making it easy to test and verify independently.
- Offline-first by design: no backend, so the app is fast, private, and free to run.
- Schema versioning: database upgrades and backup formats are versioned to protect existing data.
- Safe exports: CSV output is sanitized against formula injection.

The codebase is roughly 8,000 lines, with tests covering ranking, grades, reports, performance, and data protection.

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Installation

git clone https://github.com/<your-username>/tafaqqud.git
cd tafaqqud
npm install
### Development

npm run dev
### Run Tests

npm run test
### Production Build

npm run build
npm run preview
---

## Deployment

The app can be deployed as a static site on Netlify or Vercel. Both include SPA redirect configuration so client-side routing works on refresh.

---

## Design Philosophy

Tafaqqud is not just a paper register moved onto a screen. It turns scattered daily records into structured data that supports tracking, analysis, and better-informed educational decisions.

Attendance alone does not define a student's level, and a grade alone does not reflect their commitment. Tafaqqud combines several indicators into one system.

It is not a replacement for the teacher's judgment. It is a tool that helps teachers organize their work and follow their students more clearly and accurately.

---

## Feedback

Feedback from teachers and developers is very welcome, especially on usability, the composite ranking approach, and ideas for future improvements.
