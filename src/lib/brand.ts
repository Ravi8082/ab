export interface BrandImageInfo {
  path: string;
  mime: string;
  size: number;
}

export interface Brand {
  name_en: string;
  name_hi: string;
  tagline_en: string;
  tagline_hi: string;
  logo: BrandImageInfo | null;
  favicon: BrandImageInfo | null;
  logo_url: string | null;
  favicon_url: string | null;
  favicon_mime: string | null;
}

export type BrandField = 'logo' | 'favicon';

export const BRAND_FALLBACK: Brand = {
  name_en: 'Adhyatmik Bharat',
  name_hi: 'आध्यात्मिक भारत',
  tagline_en: 'Sundarkand Yatra · Expo 2027',
  tagline_hi: 'सुंदरकांड यात्रा · एक्स्पो 2027',
  logo: null,
  favicon: null,
  logo_url: null,
  favicon_url: null,
  favicon_mime: null,
};

export async function fetchBrand({ fresh = false }: { fresh?: boolean } = {}): Promise<Brand | null> {
  try {
    const response = await fetch('/api/brand', { cache: fresh ? 'no-store' : 'default' });
    if (!response.ok) return null;
    const body = (await response.json()) as { brand?: Brand };
    return body?.brand ?? null;
  } catch {
    return null;
  }
}

const SHIPPED_ICON = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
const BUILT_IN_FAVICON = SHIPPED_ICON?.getAttribute('href') ?? '/diya.svg';
const BUILT_IN_FAVICON_TYPE = SHIPPED_ICON?.type || 'image/svg+xml';

/** null means "no brand image", so the tab icon goes back to the file shipped in index.html. */
export function applyFavicon(url: string | null, mime = 'image/png') {
  const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]') ?? document.createElement('link');
  if (!link.rel) link.rel = 'icon';
  link.type = url ? mime : BUILT_IN_FAVICON_TYPE;
  link.href = url ?? BUILT_IN_FAVICON;
  if (!link.isConnected) document.head.appendChild(link);
}
