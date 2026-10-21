-- ====================================================================
-- CARECUE — SUPABASE DATABASE SCHEMA & ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================
-- Run this in the Supabase SQL Editor for your project:
-- https://suvrmmuwvxtvghgbtnvs.supabase.co
-- ====================================================================

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- 2. MEDICINES TABLE
CREATE TABLE IF NOT EXISTS public.medicines (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  times TEXT[] NOT NULL DEFAULT '{}',
  frequency TEXT DEFAULT 'custom',
  start_date DATE NOT NULL,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration helper if medicines table already exists:
-- ALTER TABLE public.medicines ADD COLUMN IF NOT EXISTS frequency TEXT DEFAULT 'custom';

-- Enable RLS on medicines
ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;

-- Medicines Policies (strictly scoped to auth.uid())
DROP POLICY IF EXISTS "Users can view own medicines" ON public.medicines;
CREATE POLICY "Users can view own medicines"
  ON public.medicines FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own medicines" ON public.medicines;
CREATE POLICY "Users can insert own medicines"
  ON public.medicines FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own medicines" ON public.medicines;
CREATE POLICY "Users can update own medicines"
  ON public.medicines FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own medicines" ON public.medicines;
CREATE POLICY "Users can delete own medicines"
  ON public.medicines FOR DELETE
  USING (auth.uid() = user_id);


-- 3. DOSE LOGS TABLE (For real adherence tracking)
CREATE TABLE IF NOT EXISTS public.dose_logs (
  id TEXT PRIMARY KEY,
  medicine_id TEXT NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  scheduled_time TEXT NOT NULL,
  logged_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('taken', 'skipped', 'snoozed')),
  notes TEXT
);

-- Enable RLS on dose_logs
ALTER TABLE public.dose_logs ENABLE ROW LEVEL SECURITY;

-- Dose Logs Policies
DROP POLICY IF EXISTS "Users can view own dose logs" ON public.dose_logs;
CREATE POLICY "Users can view own dose logs"
  ON public.dose_logs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own dose logs" ON public.dose_logs;
CREATE POLICY "Users can insert own dose logs"
  ON public.dose_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own dose logs" ON public.dose_logs;
CREATE POLICY "Users can update own dose logs"
  ON public.dose_logs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own dose logs" ON public.dose_logs;
CREATE POLICY "Users can delete own dose logs"
  ON public.dose_logs FOR DELETE
  USING (auth.uid() = user_id);

-- Indices for optimal query performance
CREATE INDEX IF NOT EXISTS idx_medicines_user_id ON public.medicines(user_id);
CREATE INDEX IF NOT EXISTS idx_dose_logs_user_date ON public.dose_logs(user_id, scheduled_date);
