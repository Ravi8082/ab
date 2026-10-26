/**
 * Event types the admin list starts with. 'route' means the type runs across several cities
 * and shares the public site's city sections; 'single' means one venue on fixed dates and
 * shares the expo slot. Types are editable in the panel, so this is only the first-run seed.
 */
export const DEFAULT_EVENT_KINDS = [
  { slug: 'yatra', label_en: 'Yatra', label_hi: 'यात्रा', layout: 'route', sort_order: 10 },
  { slug: 'expo', label_en: 'Expo', label_hi: 'एक्स्पो', layout: 'single', sort_order: 20 },
  { slug: 'satsang', label_en: 'Satsang', label_hi: 'सत्संग', layout: 'single', sort_order: 30 },
  { slug: 'mahotsav', label_en: 'Mahotsav', label_hi: 'महोत्सव', layout: 'single', sort_order: 40 },
  { slug: 'katha', label_en: 'Katha', label_hi: 'कथा', layout: 'route', sort_order: 50 },
  { slug: 'camp', label_en: 'Camp', label_hi: 'शिविर', layout: 'single', sort_order: 60 },
];
