import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, getUserProfile, saveUserProfile } from '../services/supabase';
import { UserProfile } from '../types';

interface AuthUser {
  id: string;
  email: string;
  fullName?: string;
  phone?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isGuest: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, fullName: string, phone?: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => void;
  updateProfile: (fullName: string, phone: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGuest, setIsGuest] = useState<boolean>(false);

  useEffect(() => {
    // Check local guest session first
    const guestStored = localStorage.getItem('carecue_is_guest');
    if (guestStored === 'true') {
      setIsGuest(true);
      const guestProfile: UserProfile = {
        id: 'guest',
        full_name: 'Guest User',
        email: 'guest@carecue.app',
        phone: '',
      };
      setUser({ id: 'guest', email: 'guest@carecue.app', fullName: 'Guest User' });
      setProfile(guestProfile);
      setIsLoading(false);
      return;
    }

    // Check Supabase session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        handleUserSession(session.user);
      } else {
        setIsLoading(false);
      }
    }).catch(err => {
      console.warn('Session check failed:', err);
      setIsLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await handleUserSession(session.user);
      } else {
        if (!isGuest) {
          setUser(null);
          setProfile(null);
        }
      }
      setIsLoading(false);
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [isGuest]);

  async function handleUserSession(sbUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
    const email = sbUser.email || '';
    const metadata = sbUser.user_metadata || {};
    const metaName = (metadata.full_name as string) || (metadata.name as string) || (email ? email.split('@')[0] : 'CareCue user');
    const metaPhone = (metadata.phone as string) || '';

    const authUser: AuthUser = {
      id: sbUser.id,
      email,
      fullName: metaName,
      phone: metaPhone,
    };
    setUser(authUser);
    setIsGuest(false);
    localStorage.removeItem('carecue_is_guest');

    // Load profile from DB
    try {
      const prof = await getUserProfile(sbUser.id);
      if (prof) {
        setProfile(prof);
      } else {
        // Create initial profile
        const newProf = await saveUserProfile(sbUser.id, metaName, metaPhone, email);
        setProfile(newProf);
      }
    } catch (e) {
      console.warn('Error loading profile in session:', e);
      setProfile({
        id: sbUser.id,
        full_name: metaName,
        email,
        phone: metaPhone,
      });
    }
    setIsLoading(false);
  }

  const signInWithEmail = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      if (data.user) {
        await handleUserSession(data.user);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const signUpWithEmail = async (email: string, password: string, fullName: string, phone?: string): Promise<string | null> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone: phone || null,
          },
        },
      });
      if (error) throw error;

      if (data.session && data.user) {
        await handleUserSession(data.user);
        return null;
      }

      return 'Account request submitted. Please check your email for a confirmation link, then sign in.';
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  };

  const signInAsGuest = () => {
    setIsGuest(true);
    localStorage.setItem('carecue_is_guest', 'true');
    const guestUser: AuthUser = {
      id: 'guest',
      email: 'guest@carecue.app',
      fullName: 'Guest User',
      phone: '',
    };
    const guestProfile: UserProfile = {
      id: 'guest',
      full_name: 'Guest User',
      email: 'guest@carecue.app',
      phone: '',
    };
    setUser(guestUser);
    setProfile(guestProfile);
  };

  const updateProfile = async (fullName: string, phone: string) => {
    if (!user) return;
    const updated = await saveUserProfile(user.id, fullName, phone, user.email);
    setProfile(updated);
    setUser(prev => prev ? { ...prev, fullName, phone } : null);
  };

  const signOut = async () => {
    setIsLoading(true);
    try {
      localStorage.removeItem('carecue_is_guest');
      setIsGuest(false);
      setUser(null);
      setProfile(null);
      await supabase.auth.signOut().catch(() => {});
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading,
        isGuest,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signInAsGuest,
        updateProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
