import { useBrand } from '@/context/BrandContext';

export function LotusMark({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="19" stroke="#13BBE8" strokeOpacity=".45" />
      <path d="M20 9c3.4 4.6 3.4 9.8 0 14.4-3.4-4.6-3.4-9.8 0-14.4Z" fill="#EE2C8F" />
      <path d="M20 23.4c4-2.2 8.4-1.6 11.4 1.6-4 2.2-8.4 1.6-11.4-1.6Z" fill="#F39A1E" />
      <path d="M20 23.4c-4-2.2-8.4-1.6-11.4 1.6 4 2.2 8.4 1.6 11.4-1.6Z" fill="#F39A1E" />
      <path d="M20 23.4c5-2.6 10.4-2.4 14.4.8-5 2.6-10.4 2.4-14.4-.8Z" fill="#FFD21F" fillOpacity=".85" />
      <path d="M20 23.4c-5-2.6-10.4-2.4-14.4.8 5 2.6 10.4 2.4 14.4-.8Z" fill="#FFD21F" fillOpacity=".85" />
    </svg>
  );
}

/** The site mark comes from the database; the lotus stays as the fallback until a logo is uploaded. */
export default function BrandMark({ size = 38, className = '' }: { size?: number; className?: string }) {
  const { brand } = useBrand();

  if (brand.logo_url) {
    return (
      <img
        src={brand.logo_url}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 object-contain ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return <LotusMark size={size} />;
}
