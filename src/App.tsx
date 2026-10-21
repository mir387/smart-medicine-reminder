import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SplashView } from './components/SplashView';
import { AuthView } from './components/AuthView';
import { DashboardView } from './components/DashboardView';
import { AccountView } from './components/AccountView';

type AppScreen = 'splash' | 'main' | 'account';

const MainApp: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [screen, setScreen] = useState<AppScreen>('splash');

  // Once splash completes:
  const handleSplashComplete = () => {
    setScreen('main');
  };

  return (
    <div className="relative min-h-screen">
      {/* Outer Canvas — Ambient Pop Color Background with Drift */}
      <div className="ambient-mesh-canvas" aria-hidden="true">
        <div className="mesh-glow-1" />
        <div className="mesh-glow-2" />
        <div className="mesh-glow-3" />
        <div className="mesh-glow-center" />
      </div>
      <div className="ambient-grain" aria-hidden="true" />

      {/* Main View Router */}
      <div className="relative z-10">
        {screen === 'splash' && <SplashView onComplete={handleSplashComplete} />}

        {screen !== 'splash' && isLoading && (
          <div className="min-h-screen grid place-items-center text-[#10B981]">
            <div className="flex flex-col items-center gap-3 bg-white/80 p-8 rounded-2xl shadow-lg border border-white/60 backdrop-blur-md">
              <div className="w-10 h-10 border-3 border-[#10B981]/20 border-t-[#10B981] rounded-full animate-spin" />
              <p className="text-xs font-semibold text-[#64748B]">Loading CareCue Platform…</p>
            </div>
          </div>
        )}

        {screen !== 'splash' && !isLoading && !user && <AuthView />}

        {screen !== 'splash' && !isLoading && user && screen === 'account' && (
          <AccountView onBack={() => setScreen('main')} />
        )}

        {screen !== 'splash' && !isLoading && user && screen === 'main' && (
          <DashboardView onOpenAccount={() => setScreen('account')} />
        )}
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
};

export default App;
