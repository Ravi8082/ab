/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Main site brand colors
        sindoor: {
          DEFAULT: '#0F2342',
          deep: '#0A1830',
        },
        saffron: {
          DEFAULT: '#EE2C8F',   // lotus magenta — primary
          light: '#F85BA8',
          dark: '#C8166F',      // saffron-ink — text on light
          ink: '#C8166F',
        },
        sky: {
          DEFAULT: '#13BBE8',   // sky cyan — ornaments, lines
          light: '#5BD4F0',
          dark: '#0A7FA6',
        },
        marigold: {
          DEFAULT: '#FFD21F',   // petal yellow — accents on dark
          light: '#FFE15C',
        },
        amber: {
          DEFAULT: '#F39A1E',   // saffron orange — small accents
          light: '#F8B85A',
        },
        sandal: {
          DEFAULT: '#FFFDF1',   // ivory page background
          2: '#FAF6E5',          // alternate section background
        },
        ivory: '#FFFDF1',
        ink: '#0F2342',          // headings on light
        text: {
          DEFAULT: '#3A4560',   // body text
          muted: '#5F6B80',
          cream: '#E8F1F8',     // body text on dark
        },
        line: '#E5E1D3',
        mandala: '#D3CFBF',
        muted: '#5F6B80',
        success: '#2F7D32',
        error: '#B42318',
        'cream-on-dark': '#E8F1F8',
        // Keep old references for compatibility
        navy: {
          DEFAULT: '#0F2342',
          50: '#E8EDF5',
          100: '#D1DAEB',
          200: '#A3B4D7',
          300: '#758FC3',
          400: '#476AAF',
          500: '#2D4D86',
          600: '#1E3A6B',
          700: '#0F2342',
          800: '#0A1830',
          900: '#06122A',
        },
        gold: {
          DEFAULT: '#13BBE8',   // now sky cyan
          light: '#5BD4F0',
          dark: '#0A7FA6',
        },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', '"Tiro Devanagari Hindi"', 'serif'],
        body: ['Barlow', '"Hind"', 'sans-serif'],
        ui: ['"Barlow Condensed"', '"Hind"', 'sans-serif'],
        hindi: ['"Tiro Devanagari Hindi"', '"Noto Serif Devanagari"', 'serif'],
        devanagari: ['"Tiro Devanagari Hindi"', 'serif'],
        mukta: ['Barlow', '"Hind"', 'sans-serif'], // backward compat
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      maxWidth: {
        container: '1240px',
      },
      borderRadius: {
        '14': '14px',
        '24': '24px',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        flicker: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '25%': { opacity: '0.85', transform: 'scale(1.05)' },
          '50%': { opacity: '0.95', transform: 'scale(0.98)' },
          '75%': { opacity: '0.8', transform: 'scale(1.03)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        floatUp: {
          '0%': { transform: 'translateY(0) scale(1)', opacity: '0.6' },
          '100%': { transform: 'translateY(-120vh) scale(0.2)', opacity: '0' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
        sunrise: {
          '0%': { opacity: '0', transform: 'translateY(40%) scale(0.8)' },
          '60%': { opacity: '1' },
          '100%': { opacity: '0.3', transform: 'translateY(0) scale(1.1)' },
        },
        aurora: {
          '0%, 100%': { transform: 'translateX(-10%) translateY(0) rotate(0deg)', opacity: '0.3' },
          '50%': { transform: 'translateX(10%) translateY(-20px) rotate(2deg)', opacity: '0.5' },
        },
        ripple: {
          '0%': { transform: 'scale(0.8)', opacity: '0.5' },
          '100%': { transform: 'scale(2.5)', opacity: '0' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.5' },
          '50%': { transform: 'scale(1.08)', opacity: '0.8' },
        },
        slideUp: {
          '0%': { transform: 'translateY(30px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        gradientShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      animation: {
        flicker: 'flicker 3s ease-in-out infinite',
        shimmer: 'shimmer 4s linear infinite',
        'glow-pulse': 'glowPulse 4s ease-in-out infinite',
        sunrise: 'sunrise 4s ease-smooth forwards',
        aurora: 'aurora 8s ease-in-out infinite',
        ripple: 'ripple 3s ease-out infinite',
        breathe: 'breathe 5s ease-in-out infinite',
        'slide-up': 'slideUp 0.6s ease-smooth forwards',
        'gradient-shift': 'gradientShift 6s ease infinite',
      },
      backgroundImage: {
        'gold-shimmer': 'linear-gradient(110deg, transparent 25%, rgba(19,187,232,0.4) 50%, transparent 75%)',
        'grad-hand': 'linear-gradient(90deg, #EE2C8F 0%, #C8166F 100%)',
      },
    },
  },
  plugins: [],
};
