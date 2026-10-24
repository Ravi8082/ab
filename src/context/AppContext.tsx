import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Lang } from '@/types';

interface AppContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  reducedMotion: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem('ab-lang');
    return saved === 'hi' ? 'hi' : 'en';
  });
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('ab-theme');
    return saved === 'light' ? 'light' : 'dark';
  });
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    localStorage.setItem('ab-lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    localStorage.setItem('ab-theme', theme);
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  const toggleLang = () => setLang((l) => (l === 'en' ? 'hi' : 'en'));
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <AppContext.Provider value={{ lang, setLang, toggleLang, theme, toggleTheme, reducedMotion }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
