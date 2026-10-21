import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

interface AccountViewProps {
  onBack: () => void;
}

export const AccountView: React.FC<AccountViewProps> = ({ onBack }) => {
  const { user, profile, updateProfile, signOut } = useAuth();

  const [fullName, setFullName] = useState(profile?.full_name || user?.fullName || '');
  const [phone, setPhone] = useState(profile?.phone || user?.phone || '');
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ message: string; isError: boolean } | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setPhone(profile.phone || '');
    } else if (user) {
      setFullName(user.fullName || '');
      setPhone(user.phone || '');
    }
  }, [profile, user]);

  const handleSave = async () => {
    if (fullName.length > 100 || phone.length > 20) {
      setStatus({ message: 'Please check the name and phone number length.', isError: true });
      return;
    }

    setIsSaving(true);
    setStatus({ message: 'Saving your changes...', isError: false });

    try {
      await updateProfile(fullName.trim(), phone.trim());
      setStatus({ message: 'Your profile has been saved.', isError: false });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Could not save changes.';
      setStatus({ message: errMsg, isError: true });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    if (window.confirm('Are you sure you want to sign out?')) {
      await signOut();
    }
  };

  const email = user?.email || 'guest@carecue.app';
  const initial = (fullName.trim() || email).charAt(0).toUpperCase() || 'C';

  return (
    <div className="min-h-screen bg-[#f5faf8] text-[#173b35]">
      <header className="flex items-center justify-between px-5 py-4 bg-white border-b border-[#e3eeea]">
        <div className="text-xl font-extrabold text-[#0f766e]">CareCue</div>
        <button
          onClick={onBack}
          type="button"
          className="border-none rounded-xl px-3.5 py-2 bg-[#e6f5f0] text-[#0f766e] text-sm font-bold hover:bg-[#d5ece4] transition-colors cursor-pointer"
        >
          ← Back
        </button>
      </header>

      <main className="w-full max-w-[520px] mx-auto px-4.5 py-6">
        <section className="bg-white border border-[#e3eeea] rounded-[22px] p-6 text-center shadow-[0_6px_22px_rgba(15,118,110,0.06)]">
          <div className="w-20 h-20 flex items-center justify-center mx-auto mb-3.5 rounded-full bg-[#d9f4eb] text-[#0f766e] text-3xl font-extrabold">
            {initial}
          </div>
          <h1 className="m-0 mb-1.5 text-2xl font-bold">{fullName.trim() || 'My Account'}</h1>
          <p className="m-0 text-sm text-[#718580] break-all">{email}</p>
        </section>

        <h2 className="mt-6 mb-3 mx-1 text-sm font-extrabold uppercase tracking-wide text-[#718580]">Personal information</h2>

        <section className="bg-white border border-[#e3eeea] rounded-[18px] px-4 py-1.5">
          <div className="py-3.5 border-b border-[#edf3f0]">
            <label className="block mb-1.5 text-xs text-[#718580] font-medium" htmlFor="fullName">
              Full name
            </label>
            <input
              id="fullName"
              type="text"
              maxLength={100}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              autoComplete="name"
              className="w-full border border-[#e0eae5] rounded-xl p-3 bg-[#fbfdfc] text-[#173b35] text-sm focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20"
            />
          </div>

          <div className="py-3.5 border-b border-[#edf3f0]">
            <label className="block mb-1.5 text-xs text-[#718580] font-medium" htmlFor="accountEmail">
              Email address
            </label>
            <input
              id="accountEmail"
              type="email"
              value={email}
              readOnly
              className="w-full border border-[#e0eae5] rounded-xl p-3 bg-[#f3f8f6] text-slate-500 text-sm cursor-not-allowed"
            />
          </div>

          <div className="py-3.5">
            <label className="block mb-1.5 text-xs text-[#718580] font-medium" htmlFor="accountPhone">
              Phone number
            </label>
            <input
              id="accountPhone"
              type="tel"
              maxLength={20}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Enter phone number (optional)"
              autoComplete="tel"
              className="w-full border border-[#e0eae5] rounded-xl p-3 bg-[#fbfdfc] text-[#173b35] text-sm focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20"
            />
          </div>
        </section>

        <button
          onClick={handleSave}
          disabled={isSaving}
          type="button"
          className="w-full mt-3.5 p-3.5 rounded-xl bg-[#0f766e] hover:bg-[#0d6861] text-white text-sm font-bold shadow-xs cursor-pointer transition-colors disabled:opacity-60"
        >
          {isSaving ? 'Saving changes...' : 'Save changes'}
        </button>

        <h2 className="mt-7 mb-3 mx-1 text-sm font-extrabold uppercase tracking-wide text-[#718580]">Account settings</h2>

        <button
          onClick={onBack}
          type="button"
          className="w-full mt-2.5 p-3.5 rounded-xl bg-[#e6f5f0] hover:bg-[#d9ede6] text-[#0f766e] text-sm font-bold cursor-pointer transition-colors"
        >
          Medicine reminders
        </button>

        <button
          onClick={onBack}
          type="button"
          className="w-full mt-2.5 p-3.5 rounded-xl bg-[#e6f5f0] hover:bg-[#d9ede6] text-[#0f766e] text-sm font-bold cursor-pointer transition-colors"
        >
          Go to home
        </button>

        <button
          onClick={handleSignOut}
          type="button"
          className="w-full mt-2.5 p-3.5 rounded-xl bg-[#fff0ef] hover:bg-[#ffe3e1] text-[#c62828] text-sm font-bold cursor-pointer transition-colors"
        >
          Sign out
        </button>

        {status && (
          <p
            role="status"
            className={`min-h-[20px] mt-3 text-center text-xs break-all ${
              status.isError ? 'text-[#c62828]' : 'text-[#0f766e]'
            }`}
          >
            {status.message}
          </p>
        )}

        <footer className="mt-7 text-center text-[#718580] text-xs">
          CareCue · Your health, your routine.
        </footer>
      </main>

      <div className="text-center py-5 text-xs text-[#718580]">
        Created by <span className="text-[#e53935] font-extrabold tracking-wide">MIR MD. TOUHID</span>
      </div>
    </div>
  );
};
