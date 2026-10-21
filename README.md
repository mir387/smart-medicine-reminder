# CareCue — Smart Medicine Reminder

CareCue is a mobile-first medicine reminder and routine management application. CareCue organises prescribed medicine reminder schedules, tracks daily dose adherence, and synchronises routines securely with Supabase.

> **Important Healthcare Notice:** CareCue is designed solely to organise reminder schedules and dose logs. It does not diagnose medical conditions, prescribe medicines, change dosages, or replace professional healthcare guidance.

---

## 🚀 Key Features

1. **Mobile-First Experience & Design System:**
   - Signature clinical emerald (`#087F73`) and soft-mint surfaces.
   - Clean 8px grid layout, high-contrast readable typography, accessible focus states, and reduced-motion support.
   - Personalized time-of-day greetings ("Good morning / afternoon / evening, [User]").

2. **Smart Dashboard & Today's Schedule:**
   - **Next-Reminder Highlight Card:** Prominently displays the imminent or overdue dose with instant "Log Taken" and "Snooze" actions.
   - **Weekly Adherence Recharts Bar Chart:** Visualizes daily percentage of doses taken versus missed for the current week (Monday through Sunday) with interactive tooltips and summary metrics.
   - **Chronological Today's Schedule:** Computes doses for today from active date ranges, categorising into *Upcoming*, *Overdue*, *Taken*, *Skipped*, or *Snoozed*.
   - **Real Dose Adherence:** Completed dose metrics reflect real database records from the `dose_logs` table rather than client-only activity notes.

3. **Robust Medicine Management:**
   - Multiple reminder times with 24-hour validation (e.g., `08:00, 14:00, 20:00`) and quick-add preset buttons.
   - Start date and optional end date validation (`end_date >= start_date`).
   - Duplicate submission protection with saving indicators.
   - Edit, delete, snooze, and log taken actions.

4. **Data Privacy, Backup & Restore:**
   - Validated JSON export for the authenticated user's records.
   - Safe import flow with a **Preview Modal** allowing users to inspect medicines before restoring.
   - User-scoped ownership assignment to prevent cross-account data leaks.
   - Explicit confirmation for single and bulk deletion.

5. **Notifications & Sound Cues:**
   - Web Notification API integration with synthesized Web Audio chimes for dose alarms.
   - Compatible with Capacitor `@capacitor/local-notifications` for Android builds.

---

## 🏗️ Architecture & Project Organisation

```
/
├── index.html                   # HTML entry point with synchronized SEO meta
├── metadata.json                # AI Studio application metadata
├── package.json                 # Node dependencies and scripts (dev, build, lint, test)
├── supabase-schema.sql          # SQL schema and Row Level Security (RLS) policies
├── vite.config.ts               # Vite configuration (React & Tailwind CSS plugins)
├── tsconfig.json                # TypeScript compiler configuration
├── public/
│   └── assets/logo.png          # High-resolution CareCue brand logo
├── src/
│   ├── main.tsx                 # React DOM mount point
│   ├── App.tsx                  # Root state router (Splash -> Auth -> Dashboard -> Account)
│   ├── index.css                # Tailwind CSS and CareCue brand design system
│   ├── types.ts                 # TypeScript interfaces (Medicine, DoseLog, UserProfile, etc.)
│   ├── context/
│   │   └── AuthContext.tsx      # Supabase Auth, session lifecycle, and demo guest mode
│   ├── services/
│   │   ├── supabase.ts          # Supabase client, CRUD operations, and offline fallback store
│   │   └── notifications.ts     # Audio synthesizer, Web Notifications, and dose math
│   ├── components/
│   │   ├── SplashView.tsx       # CareCue startup splash screen with logo & creator credit
│   │   ├── AuthView.tsx         # Sign in, Sign up, and Google OAuth
│   │   ├── DashboardView.tsx    # Main home dashboard, schedule, medicines list, and backup
│   │   └── AccountView.tsx      # Personal information and account management
│   └── tests/
│       └── carecue.test.ts      # Automated unit tests for validation, dates, and schedule
└── .github/workflows/
    └── android-apk.yml          # GitHub Actions workflow for building Android debug APK
```

---

## 🔒 Supabase Database Schema & Row Level Security (RLS)

All tables strictly enforce Row Level Security scoped to `auth.uid()`. You can run `supabase-schema.sql` in the Supabase SQL editor:

1. **`public.profiles`**:
   - `id UUID PRIMARY KEY REFERENCES auth.users(id)`
   - `full_name TEXT NOT NULL`
   - `phone TEXT`
   - Policy: Only the user can view, insert, and update their own profile.

2. **`public.medicines`**:
   - `id TEXT PRIMARY KEY`
   - `user_id UUID NOT NULL REFERENCES auth.users(id)`
   - `name TEXT NOT NULL`
   - `times TEXT[] NOT NULL`
   - `start_date DATE NOT NULL`
   - `end_date DATE`
   - `notes TEXT`
   - Policy: Only the owner (`auth.uid() = user_id`) can SELECT, INSERT, UPDATE, or DELETE.

3. **`public.dose_logs`**:
   - `id TEXT PRIMARY KEY`
   - `medicine_id TEXT NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE`
   - `user_id UUID NOT NULL REFERENCES auth.users(id)`
   - `scheduled_date DATE NOT NULL`
   - `scheduled_time TEXT NOT NULL`
   - `status TEXT CHECK (status IN ('taken', 'skipped', 'snoozed'))`
   - `logged_at TIMESTAMPTZ DEFAULT NOW()`

---

## 🧪 Automated Testing & Verification

Run the automated test suite with:
```bash
npm test
```

Verification covers:
- 24-hour time string parsing and chronological deduplication.
- Active medicine date range matching (`start_date <= date <= end_date`).
- Chronological dose schedule generation and overdue detection.
- Real dose log status reconciliation.
- Backup JSON structure validation.

---

## 📱 Building the Android APK

The repository contains an automated GitHub Actions workflow (`.github/workflows/android-apk.yml`) that prepares a Capacitor project and outputs an APK artifact (`app-debug.apk`):

1. Push your repository branch to GitHub.
2. In your repository, navigate to **Actions** → **Build CareCue Android APK**.
3. Click **Run workflow**.
4. Once completed, download `CareCue-debug-APK` from the workflow summary.

---

## 👨‍💻 Credits

Created by **MIR MD. TOUHID**
