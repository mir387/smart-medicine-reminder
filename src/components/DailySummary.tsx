import React from 'react';
import { ScheduledDoseItem, Medicine } from '../types';

interface DailySummaryProps {
  todayDoses: ScheduledDoseItem[];
  activeMedicines?: Medicine[];
  completedDosesCount: number;
  onOpenAddModal?: () => void;
  onFilterScheduled?: () => void;
}

export const DailySummary: React.FC<DailySummaryProps> = ({
  todayDoses,
  activeMedicines = [],
  completedDosesCount,
  onOpenAddModal,
  onFilterScheduled,
}) => {
  const totalScheduledDoses = todayDoses.length;
  
  // Pending doses (upcoming, overdue, snoozed)
  const remainingDoses = todayDoses.filter(
    (d) => d.status === 'upcoming' || d.status === 'overdue' || d.status === 'snoozed'
  );
  const remainingDosesCount = remainingDoses.length;

  // Distinct medications that have pending doses remaining today
  const remainingMedicineIds = new Set(remainingDoses.map((d) => d.medicineId));
  const remainingMedicinesCount = remainingMedicineIds.size;

  // Overdue count
  const overdueCount = todayDoses.filter((d) => d.status === 'overdue').length;

  // Distinct medications scheduled today in total
  const totalMedicineIds = new Set(todayDoses.map((d) => d.medicineId));
  const totalMedicinesCount = totalMedicineIds.size || activeMedicines.length;

  // Percentage of doses taken today
  const progressPct =
    totalScheduledDoses > 0
      ? Math.min(100, Math.round((completedDosesCount / totalScheduledDoses) * 100))
      : totalMedicinesCount === 0
      ? 100
      : 0;

  const isAllCompleted = totalScheduledDoses > 0 && remainingDosesCount === 0;

  return (
    <section
      aria-label="Daily Medication Summary"
      className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs transition-all hover:shadow-xs"
    >
      {/* Header with Title and Status Badge */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-black text-sm select-none border border-emerald-200/60">
            📊
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 leading-none m-0">Daily Summary</h2>
            <p className="text-[11px] text-slate-500 font-medium m-0 mt-0.5">Today&apos;s medication overview</p>
          </div>
        </div>

        {/* Status Pill Badge */}
        {isAllCompleted ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
            ✓ Done for Today
          </span>
        ) : overdueCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
            ⚠️ {overdueCount} Overdue
          </span>
        ) : remainingMedicinesCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            ⏱ {remainingMedicinesCount} {remainingMedicinesCount === 1 ? 'Med' : 'Meds'} Left
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
            No Doses
          </span>
        )}
      </div>

      {/* Main Metric Spotlight Card */}
      <div className="p-3 rounded-xl bg-gradient-to-br from-slate-50 to-emerald-50/40 border border-slate-200/80 mb-3.5">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
              Medications Remaining Today
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 tracking-tight">
                {remainingMedicinesCount}
              </span>
              <span className="text-xs font-semibold text-slate-600">
                {remainingMedicinesCount === 1 ? 'medication' : 'medications'} remaining
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[11px] font-bold text-slate-400 block mb-0.5">Pending Doses</span>
            <button
              type="button"
              onClick={onFilterScheduled}
              className="text-sm font-extrabold text-emerald-700 bg-white px-2 py-0.5 rounded-lg border border-emerald-200 hover:bg-emerald-50 transition-colors cursor-pointer"
              title="Filter scheduled doses"
            >
              {remainingDosesCount} of {totalScheduledDoses} left
            </button>
          </div>
        </div>

        {/* Informative Subtext */}
        <p className="text-[11px] text-slate-600 font-medium m-0 mt-2 flex items-center gap-1.5">
          {isAllCompleted ? (
            <span className="text-emerald-700 font-bold flex items-center gap-1">
              <span>🎉</span> All scheduled doses have been taken today! Excellent adherence.
            </span>
          ) : totalScheduledDoses === 0 ? (
            <span className="text-slate-500">
              No doses scheduled for today.{' '}
              {onOpenAddModal && (
                <button
                  type="button"
                  onClick={onOpenAddModal}
                  className="text-emerald-600 font-bold underline hover:text-emerald-800 cursor-pointer ml-1"
                >
                  Add a medication
                </button>
              )}
            </span>
          ) : (
            <span>
              <strong className="text-slate-800 font-bold">{completedDosesCount}</strong> doses taken so far,{' '}
              <strong className="text-slate-800 font-bold">{remainingDosesCount}</strong> still to take.
            </span>
          )}
        </p>
      </div>

      {/* Progress Bar of Doses Taken */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-slate-800">Doses Taken Progress</span>
            <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
              {progressPct}%
            </span>
          </div>
          <span className="font-bold text-slate-500 text-[11px]">
            {completedDosesCount} / {totalScheduledDoses} doses
          </span>
        </div>

        {/* Progress Track & Fill */}
        <div
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Doses taken: ${progressPct}%`}
          className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-200/60"
        >
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out shadow-xs ${
              isAllCompleted
                ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400'
                : overdueCount > 0
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600'
                : 'bg-gradient-to-r from-emerald-500 to-[#087F73]'
            }`}
            style={{ width: `${Math.max(progressPct, totalScheduledDoses > 0 && completedDosesCount > 0 ? 6 : 0)}%` }}
          />
        </div>
      </div>

      {/* Micro-Stats Grid */}
      <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-slate-100 text-center">
        <div className="bg-slate-50/70 p-1.5 rounded-lg border border-slate-100">
          <span className="text-[10px] font-bold text-slate-400 block leading-none mb-1">Meds Left</span>
          <span className="text-xs font-black text-slate-800">{remainingMedicinesCount}</span>
        </div>
        <div className="bg-emerald-50/50 p-1.5 rounded-lg border border-emerald-100">
          <span className="text-[10px] font-bold text-emerald-700 block leading-none mb-1">Taken</span>
          <span className="text-xs font-black text-emerald-800">{completedDosesCount}</span>
        </div>
        <div className="bg-slate-50/70 p-1.5 rounded-lg border border-slate-100">
          <span className="text-[10px] font-bold text-slate-400 block leading-none mb-1">Scheduled</span>
          <span className="text-xs font-black text-slate-800">{totalScheduledDoses}</span>
        </div>
        <div
          className={`p-1.5 rounded-lg border ${
            overdueCount > 0 ? 'bg-rose-50/70 border-rose-100' : 'bg-slate-50/70 border-slate-100'
          }`}
        >
          <span
            className={`text-[10px] font-bold block leading-none mb-1 ${
              overdueCount > 0 ? 'text-rose-600' : 'text-slate-400'
            }`}
          >
            Overdue
          </span>
          <span
            className={`text-xs font-black ${
              overdueCount > 0 ? 'text-rose-700 font-extrabold' : 'text-slate-800'
            }`}
          >
            {overdueCount}
          </span>
        </div>
      </div>
    </section>
  );
};
