import type { CityItem, EventItem, TicketType } from '@/types';

export const seedEvents: EventItem[] = [
  {
    id: 'evt-sundarkand',
    name: { en: 'Mahi Sundarkand', hi: 'माहि सुंदरकांड' },
    description: {
      en: 'A sacred recitation of the Sundarkand from the Ramcharitmanas, held simultaneously across 10 cities in 10 states. One day of collective devotion with 1,000 devotees per city.',
      hi: 'रामचरितमानस के सुंदरकांड का पवित्र पाठ, 10 राज्यों के 10 शहरों में एक साथ आयोजित। 1,000 भक्तों के साथ एक दिन का सामूहिक भक्ति।',
    },
    date: '2027-06-12',
    time: '06:00',
    venue: 'Multiple cities',
    banner_url: null,
    status: 'live',
  },
  {
    id: 'evt-expo',
    name: { en: 'Adhyatmik Bharat Expo', hi: 'आध्यात्मिक भारत एक्स्पो' },
    description: {
      en: 'A three-day spiritual exposition at Pragati Maidan, Delhi. Featuring discourses, cultural performances, sacred exhibitions, yoga sessions and the royal Rajsuya Yagya.',
      hi: 'प्रगति मैदान, दिल्ली में तीन दिन का आध्यात्मिक प्रदर्शनी। प्रवचन, सांस्कृतिक प्रस्तुतियाँ, पवित्र प्रदर्शनियाँ, योग सत्र और राजसूय यज्ञ।',
    },
    date: '2027-08-27',
    time: '09:00',
    venue: 'Pragati Maidan, Delhi',
    banner_url: null,
    status: 'live',
  },
];

export const seedTickets: TicketType[] = [
  {
    id: 'tk-path',
    event_id: 'evt-sundarkand',
    label: { en: 'Path participant', hi: 'पाठ प्रतिभागी' },
    price: 500,
    discount_percent: 15,
    discount_from: '2026-10-01',
    discount_to: '2026-12-31',
    max_quantity: 10,
    active: true,
  },
  {
    id: 'tk-visitor',
    event_id: 'evt-sundarkand',
    label: { en: 'Visitor', hi: 'दर्शक' },
    price: 200,
    discount_percent: 10,
    discount_from: '2026-10-01',
    discount_to: '2026-11-30',
    max_quantity: 10,
    active: true,
  },
  {
    id: 'tk-rajsuya',
    event_id: 'evt-expo',
    label: { en: 'Rajsuya Yagya', hi: 'राजसूय यज्ञ' },
    price: 200000,
    discount_percent: 5,
    discount_from: '2026-10-01',
    discount_to: '2027-01-31',
    max_quantity: 1,
    active: true,
  },
  {
    id: 'tk-expo-visitor',
    event_id: 'evt-expo',
    label: { en: 'Expo visitor', hi: 'एक्स्पो दर्शक' },
    price: 499,
    discount_percent: 20,
    discount_from: '2026-10-01',
    discount_to: '2026-11-15',
    max_quantity: 10,
    active: true,
  },
];

export const seedCities: CityItem[] = [
  { id: 'c-jaipur', event_id: 'evt-sundarkand', city: 'Jaipur', state: 'Rajasthan', date: '2027-06-12', time: '06:00', venue: 'TBD', capacity: 1000, booked: 340, active: true },
  { id: 'c-lucknow', event_id: 'evt-sundarkand', city: 'Lucknow', state: 'Uttar Pradesh', date: '2027-06-12', time: '06:00', venue: 'TBD', capacity: 1000, booked: 720, active: true },
  { id: 'c-bhopal', event_id: 'evt-sundarkand', city: 'Bhopal', state: 'Madhya Pradesh', date: '2027-06-12', time: '06:00', venue: 'TBD', capacity: 1000, booked: 150, active: true },
  { id: 'c-ahmedabad', event_id: 'evt-sundarkand', city: 'Ahmedabad', state: 'Gujarat', date: '2027-06-12', time: '06:00', venue: 'TBD', capacity: 1000, booked: 1000, active: true },
  { id: 'c-patna', event_id: 'evt-sundarkand', city: 'Patna', state: 'Bihar', date: '2027-06-12', time: '06:00', venue: 'TBD', capacity: 1000, booked: 480, active: true },
  { id: 'c-raipur', event_id: 'evt-sundarkand', city: 'Raipur', state: 'Chhattisgarh', date: '2027-06-12', time: '06:00', venue: 'TBD', capacity: 1000, booked: 90, active: true },
  { id: 'c-nagpur', event_id: 'evt-sundarkand', city: 'Nagpur', state: 'Maharashtra', date: '2027-06-12', time: '06:00', venue: 'TBD', capacity: 1000, booked: 610, active: true },
  { id: 'c-kolkata', event_id: 'evt-sundarkand', city: 'Kolkata', state: 'West Bengal', date: '2027-06-12', time: '06:00', venue: 'TBD', capacity: 1000, booked: 300, active: true },
  { id: 'c-hyderabad', event_id: 'evt-sundarkand', city: 'Hyderabad', state: 'Telangana', date: '2027-06-12', time: '06:00', venue: 'TBD', capacity: 1000, booked: 550, active: true },
  { id: 'c-dehradun', event_id: 'evt-sundarkand', city: 'Dehradun', state: 'Uttarakhand', date: '2027-06-12', time: '06:00', venue: 'TBD', capacity: 1000, booked: 200, active: true },
];

export const SUNDARKAND_EVENT_ID = 'evt-sundarkand';
export const EXPO_EVENT_ID = 'evt-expo';
export const WHATSAPP_NUMBER = '917499658454';
export const CONTACT_EMAIL = 'adhyatmikbharatexpo@gmail.com';
export const CONTACT_PHONE = '+91 7499658454';
