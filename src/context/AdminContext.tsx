import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { adminLogin, adminLogout, adminMe, type AdminUser } from '@/lib/adminApi';
import { clearGateCache } from '@/lib/offlineGate';

interface AdminContextValue {
  session: AdminUser | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    adminMe()
      .then(({ admin }) => {
        if (active) setSession(admin);
      })
      .catch(() => {
        // Not signed in — the login screen is shown.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { admin } = await adminLogin(email, password);
      setSession(admin);
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Sign in failed.' };
    }
  };

  const signOut = async () => {
    try {
      await adminLogout();
    } finally {
      if (session) clearGateCache(session.id);
      setSession(null);
    }
  };

  return (
    <AdminContext.Provider value={{ session, isAdmin: Boolean(session), loading, signIn, signOut }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider');
  return ctx;
}
