import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { applyFavicon, BRAND_FALLBACK, fetchBrand, type Brand } from '@/lib/brand';

interface BrandContextValue {
  brand: Brand;
  refresh: () => Promise<void>;
}

const BrandContext = createContext<BrandContextValue | null>(null);

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<Brand>(BRAND_FALLBACK);

  const refresh = useCallback(async () => {
    const next = await fetchBrand({ fresh: true });
    if (!next) return;
    setBrand(next);
    applyFavicon(next.favicon_url, next.favicon_mime ?? undefined);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <BrandContext.Provider value={{ brand, refresh }}>{children}</BrandContext.Provider>;
}

export function useBrand() {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error('useBrand must be used within BrandProvider');
  return ctx;
}
