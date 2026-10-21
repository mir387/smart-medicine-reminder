import React, { useEffect, useState } from 'react';

interface SplashViewProps {
  onComplete: () => void;
}

export const SplashView: React.FC<SplashViewProps> = ({ onComplete }) => {
  const [logoLoaded, setLogoLoaded] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 2800);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="relative flex flex-col justify-between items-center w-full max-w-[420px] min-h-[100dvh] mx-auto px-6 py-6 overflow-hidden select-none">
      {/* Soft ambient background */}
      <div
        className="absolute -top-36 left-1/2 -translate-x-1/2 w-[420px] height-[420px] h-[420px] rounded-full pointer-events-none filter blur-[30px] -z-10"
        style={{
          background: 'radial-gradient(circle, rgba(231, 247, 243, 0.98) 0%, rgba(240, 250, 247, 0.7) 48%, transparent 75%)',
        }}
      />
      <div
        className="absolute bottom-12 left-1/2 -translate-x-1/2 w-[340px] h-[260px] rounded-full pointer-events-none filter blur-[30px] -z-10"
        style={{
          background: 'radial-gradient(circle, rgba(8, 127, 115, 0.06) 0%, rgba(231, 247, 243, 0.4) 50%, transparent 80%)',
        }}
      />
      <div
        className="absolute top-[35%] -right-20 w-[190px] h-[190px] rounded-full pointer-events-none filter blur-[36px] -z-10 bg-[rgba(231,247,243,0.45)]"
      />
      <div
        className="absolute bottom-[20%] -left-20 w-[180px] h-[180px] rounded-full pointer-events-none filter blur-[36px] -z-10 bg-[rgba(231,247,243,0.45)]"
      />

      {/* Decorative status header */}
      <header className="flex justify-between items-center w-full min-h-[24px] text-[rgba(74,107,102,0.75)] text-xs font-semibold tracking-wider">
        <span>CareCue</span>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M1 9c6.1-6.1 15.9-6.1 22 0L12 21 1 9z" />
          </svg>
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M2 22h20V2L2 22z" />
          </svg>
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M16 4h-2V2h-4v2H8C6.9 4 6 4.9 6 6v14c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" />
          </svg>
        </div>
      </header>

      {/* Main branding */}
      <main className="flex flex-1 flex-col items-center justify-center w-full py-4 text-center -translate-y-3">
        <div className="relative grid place-items-center w-[140px] h-[140px] mb-6">
          <div className="absolute inset-2 rounded-full bg-[rgba(231,247,243,0.95)] blur-[19px] animate-halo" />
          <div className="relative grid place-items-center w-28 h-28 overflow-hidden rounded-[30px] border border-[rgba(8,127,115,0.08)] bg-white/95 shadow-[0_12px_34px_rgba(8,127,115,0.12),0_3px_9px_rgba(8,127,115,0.05)]">
            {logoLoaded ? (
              <img
                src="/assets/logo.png"
                alt="CareCue Official Logo"
                className="w-full h-full object-contain p-2"
                onError={() => setLogoLoaded(false)}
              />
            ) : (
              <span className="text-[#087F73] text-5xl font-extrabold select-none">✚</span>
            )}
          </div>
        </div>

        <h1 className="flex justify-center items-center gap-1.5 m-0 text-[#172B2A] text-4xl font-extrabold tracking-tight">
          <span className="text-[#087F73] text-3xl leading-none">✚</span>
          <span>Care<span className="text-[#087F73]">Cue</span></span>
        </h1>

        <div className="inline-flex items-center gap-2 mt-3 px-3.5 py-1.5 rounded-full border border-[rgba(8,127,115,0.13)] bg-[rgba(231,247,243,0.8)] text-[#075C55] text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-[#087F73]" />
          <span>Medicine Reminder</span>
        </div>

        <p className="max-w-[280px] mt-4 text-[#4A6B66] text-sm leading-relaxed">
          A little reminder, right on time.
        </p>

        <button
          onClick={onComplete}
          className="mt-6 px-5 py-2 text-xs font-bold text-[#087F73] bg-[#E7F7F3] hover:bg-[#d5f0e9] transition-colors rounded-full border border-[rgba(8,127,115,0.15)] shadow-xs"
        >
          Enter CareCue →
        </button>
      </main>

      {/* Loading animation and creator credit */}
      <footer className="flex flex-col items-center w-full pt-4">
        <div className="flex flex-col items-center gap-3 w-44">
          <div className="relative w-full h-[7px] overflow-hidden rounded-full border border-[rgba(8,127,115,0.13)] bg-[#E7F7F3]">
            <div className="animate-loader absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-[#087F73] via-[#10B981] to-[#075C55] shadow-[0_0_8px_rgba(8,127,115,0.4)]" />
          </div>

          <div className="flex items-center gap-2 text-[#087F73] text-[10px] font-bold tracking-[0.2em] uppercase">
            <span>Starting</span>
            <span className="inline-flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#087F73] animate-dot" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#087F73] animate-dot [animation-delay:180ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#087F73] animate-dot [animation-delay:360ms]" />
            </span>
          </div>
        </div>

        <div className="flex justify-center w-full min-h-[20px] mt-6 text-xs text-center">
          <span className="animate-type-once inline-block overflow-hidden whitespace-nowrap border-r-[1.5px] border-[#D62828] pr-1">
            <span className="text-[#667876] font-medium">created by </span>
            <span className="text-[#D62828] font-extrabold tracking-wide">MIR MD. TOUHID</span>
          </span>
        </div>

        <div className="mt-3 text-[#4A6B66]/80 text-[10px] font-medium text-center">
          Your schedule is saved on this device · Private &amp; Secure
        </div>

        <div className="w-24 h-1 mt-4 rounded-full bg-[rgba(7,92,85,0.15)]" />
      </footer>
    </div>
  );
};
