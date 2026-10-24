interface MandalaDividerProps {
  tone?: 'cream' | 'tint' | 'dark';
}

const STROKE = {
  cream: '#E5E1D3',
  tint: '#D3CFBF',
  dark: 'rgba(19, 187, 232, .35)',
};

export default function MandalaDivider({ tone = 'cream' }: MandalaDividerProps) {
  const line = STROKE[tone];

  return (
    <div className="pointer-events-none flex w-full items-center justify-center py-1" aria-hidden="true">
      <svg width="100%" height="34" viewBox="0 0 1200 34" preserveAspectRatio="none" fill="none">
        <path d="M0 17h520" stroke={line} strokeWidth="1" />
        <path d="M680 17h520" stroke={line} strokeWidth="1" />
      </svg>
      <svg
        className="-mx-[190px] shrink-0"
        width="46"
        height="34"
        viewBox="0 0 46 34"
        fill="none"
      >
        <g stroke={tone === 'dark' ? '#13BBE8' : '#EE2C8F'} strokeWidth="1.1" strokeLinecap="round">
          <path d="M23 6c2.8 4 2.8 8.6 0 12.6-2.8-4-2.8-8.6 0-12.6Z" />
          <path d="M23 18.6c4.6-2.6 9.6-1.9 13 1.8-4.6 2.6-9.6 1.9-13-1.8Z" />
          <path d="M23 18.6c-4.6-2.6-9.6-1.9-13 1.8 4.6 2.6 9.6 1.9 13-1.8Z" />
          <circle cx="23" cy="27" r="2" fill={tone === 'dark' ? '#FFD21F' : '#F39A1E'} stroke="none" />
        </g>
      </svg>
    </div>
  );
}
