import type { Lang, LocalizedText } from '@/types';

export const t = (text: LocalizedText, lang: Lang): string => text[lang] ?? text.en;

export const ui = {
  nav: {
    sundarkand: { en: 'Mahi Sundarkand', hi: 'माहि सुंदरकांड' },
    expo: { en: 'Adhyatmik Bharat Expo', hi: 'आध्यात्मिक भारत एक्स्पो' },
    myBooking: { en: 'My booking', hi: 'मेरी बुकिंग' },
    contact: { en: 'Contact', hi: 'संपर्क' },
    register: { en: 'Register', hi: 'रजिस्टर करें' },
  },
  hero: {
    titleHi: 'आध्यात्मिक भारत',
    titleEn: 'Adhyatmik Bharat',
    subtitle: {
      en: 'A devotional journey across Bharat — sacred recitations in 10 cities and a grand spiritual expo in Delhi.',
      hi: 'भारत भर में एक आध्यात्मिक यात्रा — 10 शहरों में पवित्र पाठ और दिल्ली में एक भव्य आध्यात्मिक एक्स्पो।',
    },
  },
  sundarkand: {
    title: { en: 'Mahi Sundarkand', hi: 'माहि सुंदरकांड' },
    tagline: {
      en: 'One day. Ten cities. Ten states. A sacred chorus of devotion.',
      hi: 'एक दिन। दस शहर। दस राज्य। भक्ति का पवित्र समूहगान।',
    },
    oneDay: { en: '1 day', hi: '1 दिन' },
    cities: { en: '10 cities', hi: '10 शहर' },
    states: { en: '10 states', hi: '10 राज्य' },
    devotees: { en: '1,000 devotees / city', hi: '1,000 भक्त / शहर' },
    attendees: { en: '30,000 attendees', hi: '30,000 प्रतिभागी' },
    seatsLeft: { en: 'seats left', hi: 'सीटें बची हैं' },
    soldOut: { en: 'Sold out', hi: 'समाप्त' },
    pathParticipant: { en: 'Path participant', hi: 'पाठ प्रतिभागी' },
    visitor: { en: 'Visitor', hi: 'दर्शक' },
    perHead: { en: 'per head', hi: 'प्रति व्यक्ति' },
    register: { en: 'Register', hi: 'रजिस्टर करें' },
  },
  expo: {
    title: { en: 'Adhyatmik Bharat Expo', hi: 'आध्यात्मिक भारत एक्स्पो' },
    tagline: {
      en: '27–29 August 2027 · Pragati Maidan, Delhi',
      hi: '27–29 अगस्त 2027 · प्रगति मैदान, दिल्ली',
    },
    rajsuya: { en: 'Rajsuya Yagya', hi: 'राजसूय यज्ञ' },
    rajsuyaDesc: {
      en: 'A sacred Vedic fire ceremony. Participate in the royal yagya and receive divine blessings.',
      hi: 'एक पवित्र वैदिक अग्नि संस्कार। राजसूय यज्ञ में भाग लें और दिव्य आशीर्वाद प्राप्त करें।',
    },
    rajsuyaRegister: { en: 'Register for Rajsuya Yagya', hi: 'राजसूय यज्ञ के लिए रजिस्टर करें' },
    expoVisitor: { en: 'Expo visitor', hi: 'एक्स्पो दर्शक' },
    expoVisitorDesc: {
      en: 'Full access to all three days of the Adhyatmik Bharat Expo at Pragati Maidan.',
      hi: 'प्रगति मैदान में आध्यात्मिक भारत एक्स्पो के तीनों दिनों की पूरी पहुँच।',
    },
    benefits: [
      {
        id: 'b1',
        title: { en: 'Spiritual discourses', hi: 'आध्यात्मिक प्रवचन' },
        description: { en: 'Talks by revered saints and scholars from across Bharat.', hi: 'भारत भर के वंदनीय संतों और विद्वानों द्वारा प्रवचन।' },
      },
      {
        id: 'b2',
        title: { en: 'Cultural performances', hi: 'सांस्कृतिक प्रस्तुतियाँ' },
        description: { en: 'Classical music, dance and devotional renditions.', hi: 'शास्त्रीय संगीत, नृत्य और भक्तिमय प्रस्तुतियाँ।' },
      },
      {
        id: 'b3',
        title: { en: 'Sacred exhibitions', hi: 'पवित्र प्रदर्शनियाँ' },
        description: { en: 'Immersive exhibits on Bharat\'s spiritual heritage.', hi: 'भारत की आध्यात्मिक धरोहर पर इमर्सिव प्रदर्शनियाँ।' },
      },
      {
        id: 'b4',
        title: { en: 'Yoga & meditation', hi: 'योग एवं ध्यान' },
        description: { en: 'Guided sessions by experienced yoga acharyas.', hi: 'अनुभवी योग आचार्यों द्वारा निर्देशित सत्र।' },
      },
      {
        id: 'b5',
        title: { en: 'Devotional bazaar', hi: 'भक्ति बाज़ार' },
        description: { en: 'Sacred books, idols, and spiritual artifacts.', hi: 'पवित्र पुस्तकें, मूर्तियाँ और आध्यात्मिक वस्तुएँ।' },
      },
    ],
  },
  cta: {
    title: { en: 'Join Adhyatmik Bharat', hi: 'आध्यात्मिक भारत में शामिल हों' },
    subtitle: {
      en: 'Become part of a once-in-a-lifetime spiritual gathering.',
      hi: 'एक जीवनभर की आध्यात्मिक सभा का हिस्सा बनें।',
    },
    sundarkand: { en: 'Register for Mahi Sundarkand', hi: 'माहि सुंदरकांड के लिए रजिस्टर करें' },
    expo: { en: 'Register for Expo', hi: 'एक्स्पो के लिए रजिस्टर करें' },
    whatsapp: { en: 'WhatsApp us', hi: 'व्हाट्सएप करें' },
  },
  footer: {
    contact: { en: 'Contact', hi: 'संपर्क' },
    email: 'adhyatmikbharatexpo@gmail.com',
    phone: '+91 7499658454',
    about: { en: 'About', hi: 'परिचय' },
    faq: { en: 'FAQ', hi: 'सामान्य प्रश्न' },
    contactLink: { en: 'Contact', hi: 'संपर्क' },
    privacy: { en: 'Privacy', hi: 'गोपनीयता' },
    terms: { en: 'Terms', hi: 'नियम' },
    refund: { en: 'Refund policy', hi: 'धन वापसी नीति' },
    rights: { en: 'All rights reserved.', hi: 'सर्वाधिकार सुरक्षित।' },
  },
};

export const uiT = (text: LocalizedText, lang: Lang): string => text[lang] ?? text.en;
