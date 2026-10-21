import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const AuthView: React.FC = () => {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, signInAsGuest } = useAuth();

  const [isSignup, setIsSignup] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (isSignup && !name.trim()) {
      setMessage({ text: 'Please enter your full name.', isError: true });
      return;
    }

    if (!email.trim() || !password) {
      setMessage({ text: 'Please enter your email and password.', isError: true });
      return;
    }

    if (password.length < 8) {
      setMessage({ text: 'Password must be at least 8 characters.', isError: true });
      return;
    }

    setIsBusy(true);

    try {
      if (isSignup) {
        const info = await signUpWithEmail(email.trim(), password, name.trim(), phone.trim() || undefined);
        if (info) {
          setMessage({ text: info, isError: false });
        }
      } else {
        await signInWithEmail(email.trim(), password);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Authentication failed. Please check your credentials.';
      setMessage({ text: errMsg, isError: true });
    } finally {
      setIsBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setMessage(null);
    setIsBusy(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Google sign-in could not be completed.';
      setMessage({ text: errMsg, isError: true });
      setIsBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-gradient-to-br from-[#f0fdfa] to-[#eff6ff] text-[#153b38]">
      <main className="w-full max-w-[420px] p-7 md:p-8 rounded-3xl bg-white shadow-[0_12px_40px_rgba(15,118,110,0.1)] border border-[#e2e8f0]">
        <div className="text-2xl font-extrabold text-[#0f766e] flex items-center gap-1.5">
          <span className="text-xl">✚</span> CareCue
        </div>

        <h1 className="mt-6 mb-2 text-2xl md:text-3xl font-extrabold tracking-tight text-[#153b38]">
          {isSignup ? 'Create your account' : 'Welcome back'}
        </h1>

        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          {isSignup
            ? 'Your medicine schedule, organised in one place.'
            : 'Sign in to continue to CareCue.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignup && (
            <div>
              <label htmlFor="name" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Full name *
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
                autoComplete="name"
                required={isSignup}
                className="w-full px-3.5 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#99f6e4] focus:border-[#0f766e] transition-all bg-white"
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Email address *
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              className="w-full px-3.5 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#99f6e4] focus:border-[#0f766e] transition-all bg-white"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Password *
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              minLength={8}
              required
              className="w-full px-3.5 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#99f6e4] focus:border-[#0f766e] transition-all bg-white"
            />
          </div>

          {isSignup && (
            <div>
              <label htmlFor="phone" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Phone number (optional)
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 XXXXX XXXXX"
                autoComplete="tel"
                className="w-full px-3.5 py-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#99f6e4] focus:border-[#0f766e] transition-all bg-white"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isBusy}
            className="w-full min-h-[46px] py-3 px-4 mt-2 rounded-xl bg-[#0f766e] hover:bg-[#0d6861] active:scale-[0.99] text-white text-sm font-bold shadow-md shadow-[#0f766e]/20 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait"
          >
            {isBusy ? 'Please wait...' : isSignup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isBusy}
          className="w-full min-h-[46px] py-3 px-4 mt-3 rounded-xl bg-white border border-slate-300 text-slate-700 text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors shadow-xs disabled:opacity-60"
        >
          <span className="text-[#4285f4] text-lg font-bold">G</span> Continue with Google
        </button>

        <div className="relative my-4 flex items-center justify-center">
          <div className="border-t border-slate-200 w-full"></div>
          <span className="bg-white px-2.5 text-xs text-slate-400 uppercase tracking-wider">or</span>
        </div>

        <button
          type="button"
          onClick={signInAsGuest}
          className="w-full py-2.5 px-4 rounded-xl bg-[#f0fdfa] border border-[#ccfbf1] text-[#0f766e] text-xs font-bold hover:bg-[#e6fbf5] transition-colors"
        >
          Quick Demo / Continue as Guest →
        </button>

        <p className="text-center text-xs text-slate-500 mt-5">
          <span>{isSignup ? 'Already have an account? ' : 'New to CareCue? '}</span>
          <button
            type="button"
            onClick={() => {
              setIsSignup(!isSignup);
              setMessage(null);
            }}
            className="text-[#0f766e] font-bold hover:underline"
          >
            {isSignup ? 'Sign in' : 'Create account'}
          </button>
        </p>

        {message && (
          <div
            role="status"
            className={`mt-4 p-3 rounded-xl text-xs leading-relaxed ${
              message.isError ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-[#0f766e] border border-emerald-200'
            }`}
          >
            {message.text}
          </div>
        )}

        <p className="text-[11px] text-slate-400 text-center mt-5 leading-normal">
          Your account is managed by Supabase. Keep your credentials private.
        </p>
      </main>
    </div>
  );
};
