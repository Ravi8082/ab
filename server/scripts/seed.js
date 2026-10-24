import bcrypt from 'bcryptjs';
import { pool, query } from '../db.js';
import { config } from '../config.js';
import { LEGAL_CONTENT } from './legal-content.js';

const L = (en, hi) => ({ en, hi });

const CONTENT = {
  hero: {
    eyebrow: L('Mahi Sundarkand · One day across Bharat', 'माहि सुंदरकांड · पूरे भारत में एक दिन'),
    title: L('Ten cities. One sacred voice.', 'दस शहर। एक पवित्र स्वर।'),
    subtitle: L(
      'On one day, the Sundarkand rises in ten cities across ten states. Reserve your place inside the main pandal, or join as a visitor and become part of a 30,000-strong gathering of devotion.',
      'एक ही दिन, दस राज्यों के दस शहरों में सुंदरकांड गूंजेगा। मुख्य पंडाल में अपना स्थान आरक्षित करें, या दर्शक के रूप में जुड़कर 30,000 भक्तों के इस पवित्र समागम का हिस्सा बनें।',
    ),
    dateLabel: L('Saturday, 12 June 2027', 'शनिवार, 12 जून 2027'),
    note: L('One day · ten cities · limited seats in every city', 'एक दिन · दस शहर · हर शहर में सीमित सीटें'),
    primaryCta: L('Choose your city', 'अपना शहर चुनें'),
    secondaryCta: L('See the Expo', 'एक्स्पो देखें'),
    stats: [
      { value: '10', label: L('Cities & states', 'शहर एवं राज्य') },
      { value: '30,000', label: L('Seats across Bharat', 'भारत भर में सीटें') },
      { value: '1,000', label: L('Pandal devotees / city', 'पंडाल भक्त / शहर') },
      { value: '₹500', label: L('Pandal darshan per head', 'पंडाल दर्शन प्रति व्यक्ति') },
    ],
  },
  yatra: {
    eyebrow: L('Choose your city', 'अपना शहर चुनें'),
    title: L('Where will you join the path?', 'आप पाठ में कहाँ जुड़ेंगे?'),
    subtitle: L(
      'Every city hosts the same one-day Sundarkand. Pick a state, pick a city, and choose the address closest to you. Seats are held for 30 minutes while you complete payment.',
      'हर शहर में एक ही दिन सुंदरकांड होगा। राज्य चुनें, शहर चुनें और अपने नज़दीकी पते का चयन करें। भुगतान पूरा होने तक सीटें 30 मिनट के लिए रोकी जाती हैं।',
    ),
    note: L('Pandal Darshan ₹500 per head · Visitor Entry ₹200 per head. No hidden charges.', 'पंडाल दर्शन ₹500 प्रति व्यक्ति · दर्शक प्रवेश ₹200 प्रति व्यक्ति। कोई छिपा शुल्क नहीं।'),
  },
  expo: {
    eyebrow: L('Adhyatmik Bharat Expo · Delhi', 'आध्यात्मिक भारत एक्स्पो · दिल्ली'),
    title: L('The grand gathering, three days in Delhi', 'भव्य समागम, दिल्ली में तीन दिन'),
    subtitle: L(
      'The Mahi Sundarkand yatra closes with the Adhyatmik Bharat Expo at Pragati Maidan — three days of darshan, discourse, yagya and a spiritual bazaar. Register for the Rajsuya Yagya, or visit the expo as a guest.',
      'माहि सुंदरकांड यात्रा का समापन प्रगति मैदान में आध्यात्मिक भारत एक्स्पो के साथ होता है — दर्शन, प्रवचन, यज्ञ और आध्यात्मिक बाज़ार के तीन दिन। राजसूय यज्ञ के लिए रजिस्टर करें, या दर्शक के रूप में एक्स्पो आएँ।',
    ),
    venue: L('Pragati Maidan, New Delhi', 'प्रगति मैदान, नई दिल्ली'),
    benefits: [
      { title: L('Rajsuya Yagya', 'राजसूय यज्ञ'), desc: L('A sacred Vedic fire ceremony with your sankalp included in the yagya.', 'पवित्र वैदिक अग्नि संस्कार, जिसमें आपका संकल्प सम्मिलित होगा।') },
      { title: L('Darshan & discourse', 'दर्शन एवं प्रवचन'), desc: L('Saints, scholars and acharyas from across Bharat on one stage.', 'भारत भर के संत, विद्वान और आचार्य एक ही मंच पर।') },
      { title: L('Spiritual bazaar', 'आध्यात्मिक बाज़ार'), desc: L('Sacred books, idols, ayurveda, rudraksha and handloom in one hall.', 'पवित्र पुस्तकें, मूर्तियाँ, आयुर्वेद, रुद्राक्ष और हथकरघा एक ही हॉल में।') },
      { title: L('Yoga & meditation', 'योग एवं ध्यान'), desc: L('Guided sessions through all three days of the expo.', 'एक्स्पो के तीनों दिन निर्देशित सत्र।') },
    ],
  },
  process: {
    eyebrow: L('How your pass works', 'आपका पास कैसे काम करता है'),
    title: L('From seat to QR pass in four steps', 'सीट से QR पास तक चार कदम'),
    steps: [
      { title: L('Choose city & address', 'शहर और पता चुनें'), desc: L('Filter by state, then city, then the venue address where you will attend.', 'राज्य, फिर शहर और फिर उस पते का चयन करें जहाँ आप शामिल होंगे।') },
      { title: L('Verify by OTP', 'OTP से सत्यापन'), desc: L('Enter your details and confirm the email code. One verified booking at a time.', 'अपना विवरण भरें और ईमेल कोड की पुष्टि करें। एक बार में एक सत्यापित बुकिंग।') },
      { title: L('Pay securely', 'सुरक्षित भुगतान'), desc: L('Pay for the seats you need. Capacity is checked again on the server before payment.', 'आवश्यक सीटों का भुगतान करें। भुगतान से पहले सर्वर पर क्षमता फिर जाँची जाती है।') },
      { title: L('Get your QR pass', 'अपना QR पास पाएँ'), desc: L('The pass is emailed instantly. Staff scan the QR at the gate and verify your reference.', 'पास तुरंत ईमेल होता है। गेट पर स्टाफ QR स्कैन करके आपका संदर्भ सत्यापित करता है।') },
    ],
  },
  faq: {
    title: L('Questions devotees ask', 'भक्तों के सामान्य प्रश्न'),
    items: [
      { q: L('Is the ₹500 ticket inside the main pandal?', 'क्या ₹500 का टिकट मुख्य पंडाल के अंदर है?'), a: L('Yes. Pandal Darshan at ₹500 per head gives you a place inside the main pandal where the Sundarkand path takes place. Visitor Entry at ₹200 gives access to the venue and live screening.', 'हाँ। ₹500 प्रति व्यक्ति के पंडाल दर्शन से मुख्य पंडाल के अंदर स्थान मिलता है जहाँ सुंदरकांड पाठ होता है। ₹200 का दर्शक प्रवेश स्थल और लाइव स्क्रीनिंग तक पहुँच देता है।') },
      { q: L('Can I attend a different city than the one I selected?', 'क्या मैं चुने गए शहर के अलावा किसी और शहर में जा सकता हूँ?'), a: L('Your pass is valid only at the city and address printed on it. Choose carefully, or book separate passes for different cities.', 'आपका पास केवल उसी शहर और पते पर मान्य है जो उस पर छपा है। ध्यान से चुनें, या अलग शहरों के लिए अलग पास बुक करें।') },
      { q: L('What is the Rajsuya Yagya registration?', 'राजसूय यज्ञ रजिस्ट्रेशन क्या है?'), a: L('Registration for the Rajsuya Yagya at the Expo in Delhi is ₹2,00,000 and includes participant sankalp, reserved seating, prasad and a memento. This is separate from the ₹499 expo visitor pass.', 'दिल्ली एक्स्पो में राजसूय यज्ञ का रजिस्ट्रेशन ₹2,00,000 है, जिसमें प्रतिभागी संकल्प, आरक्षित बैठक, प्रसाद और स्मृति-चिह्न शामिल हैं। यह ₹499 के एक्स्पो दर्शक पास से अलग है।') },
      { q: L('Do I need to carry a printed pass?', 'क्या मुझे छपा हुआ पास ले जाना होगा?'), a: L('No. The QR pass on your phone is sufficient. Staff scan it at the gate, match the reference in our database, and check you in for the day. Multi-day passes allow one entry on each event day.', 'नहीं। आपके फ़ोन पर QR पास पर्याप्त है। गेट पर स्टाफ इसे स्कैन करता है, हमारे डेटाबेस में संदर्भ मिलाता है और उस दिन के लिए चेक-इन करता है। बहु-दिवीय पास हर आयोजन दिन एक बार प्रवेश देता है।') },
      { q: L('Can I cancel or change my booking?', 'क्या मैं बुकिंग रद्द या बदल सकता हूँ?'), a: L('Bookings can be cancelled by contacting the help desk. Refunds are handled as per the event policy shown on your pass.', 'हेल्प डेस्क से संपर्क करके बुकिंग रद्द की जा सकती है। धनवापसी आपके पास पर दिखाई गई इवेंट नीति के अनुसार होगी।') },
    ],
  },
  contact: {
    title: L('Need help with your pass?', 'अपने पास में सहायता चाहिए?'),
    subtitle: L('Our team answers for every city, and for the Expo in Delhi.', 'हमारी टीम हर शहर और दिल्ली एक्स्पो के लिए उपलब्ध है।'),
    email: 'adhyatmikbharatexpo@gmail.com',
    phone: '+91 7499658454',
    whatsapp: '917499658454',
    address: L('Adhyatmik Bharat, Jaipur, Rajasthan', 'आध्यात्मिक भारत, जयपुर, राजस्थान'),
  },
  ...LEGAL_CONTENT,
};

const STATES = [
  {
    code: 'RJ', name_en: 'Rajasthan', name_hi: 'राजस्थान',
    cities: [{
      name_en: 'Jaipur', name_hi: 'जयपुर',
      venues: [
        ['Shri Ram Mandir Ground', 'श्री राम मंदिर मैदान', 'Shri Ram Mandir, Jawahar Nagar, Jaipur, Rajasthan 302004', 'श्री राम मंदिर, जवाहर नगर, जयपुर, राजस्थान 302004'],
        ['Birla Auditorium Lawns', 'बिड़ला ऑडिटोरियम लॉन', 'Birla Auditorium, Statue Circle, Jaipur, Rajasthan 302001', 'बिड़ला ऑडिटोरियम, स्टैचू सर्किल, जयपुर, राजस्थान 302001'],
      ],
    }],
  },
  {
    code: 'GJ', name_en: 'Gujarat', name_hi: 'गुजरात',
    cities: [{
      name_en: 'Ahmedabad', name_hi: 'अहमदाबाद',
      venues: [['Sabarmati Riverfront Ground', 'साबरमती रिवरफ्रंट मैदान', 'Sabarmati Riverfront Event Ground, Ahmedabad, Gujarat 380009', 'साबरमती रिवरफ्रंट इवेंट ग्राउंड, अहमदाबाद, गुजरात 380009']],
    }],
  },
  {
    code: 'MH', name_en: 'Maharashtra', name_hi: 'महाराष्ट्र',
    cities: [{
      name_en: 'Mumbai', name_hi: 'मुंबई',
      venues: [['NESCO Exhibition Grounds', 'नेस्को प्रदर्शनी मैदान', 'NESCO, Goregaon East, Mumbai, Maharashtra 400063', 'नेस्को, गोरेगांव पूर्व, मुंबई, महाराष्ट्र 400063']],
    }],
  },
  {
    code: 'MP', name_en: 'Madhya Pradesh', name_hi: 'मध्य प्रदेश',
    cities: [{
      name_en: 'Ujjain', name_hi: 'उज्जैन',
      venues: [['Mahakal Khel Maidan', 'महाकाल खेल मैदान', 'Mahakal Khel Maidan, Ujjain, Madhya Pradesh 456006', 'महाकाल खेल मैदान, उज्जैन, मध्य प्रदेश 456006']],
    }],
  },
  {
    code: 'UP', name_en: 'Uttar Pradesh', name_hi: 'उत्तर प्रदेश',
    cities: [{
      name_en: 'Varanasi', name_hi: 'वाराणसी',
      venues: [['Sampurnanand Sanskrit Ground', 'सम्पूर्णानंद संस्कृत मैदान', 'Sampurnanand Sanskrit University, Varanasi, Uttar Pradesh 221002', 'सम्पूर्णानंद संस्कृत विश्वविद्यालय, वाराणसी, उत्तर प्रदेश 221002']],
    }],
  },
  {
    code: 'UK', name_en: 'Uttarakhand', name_hi: 'उत्तराखंड',
    cities: [{
      name_en: 'Haridwar', name_hi: 'हरिद्वार',
      venues: [['Chandi Ghat Grounds', 'चंडी घाट मैदान', 'Chandi Ghat, Har Ki Pauri Road, Haridwar, Uttarakhand 249401', 'चंडी घाट, हर की पौड़ी मार्ग, हरिद्वार, उत्तराखंड 249401']],
    }],
  },
  {
    code: 'PB', name_en: 'Punjab', name_hi: 'पंजाब',
    cities: [{
      name_en: 'Amritsar', name_hi: 'अमृतसर',
      venues: [['Rambagh Gardens', 'रामबाग गार्डन', 'Rambagh Gardens, Amritsar, Punjab 143001', 'रामबाग गार्डन, अमृतसर, पंजाब 143001']],
    }],
  },
  {
    code: 'WB', name_en: 'West Bengal', name_hi: 'पश्चिम बंगाल',
    cities: [{
      name_en: 'Kolkata', name_hi: 'कोलकाता',
      venues: [['Milan Mela Grounds', 'मिलन मेला मैदान', 'Milan Mela Grounds, Kolkata, West Bengal 700029', 'मिलन मेला मैदान, कोलकाता, पश्चिम बंगाल 700029']],
    }],
  },
  {
    code: 'TN', name_en: 'Tamil Nadu', name_hi: 'तमिलनाडु',
    cities: [{
      name_en: 'Madurai', name_hi: 'मदुरै',
      venues: [['Tamukkam Grounds', 'तमुक्कम मैदान', 'Tamukkam Grounds, Madurai, Tamil Nadu 625002', 'तमुक्कम मैदान, मदुरै, तमिलनाडु 625002']],
    }],
  },
  {
    code: 'KA', name_en: 'Karnataka', name_hi: 'कर्नाटक',
    cities: [{
      name_en: 'Bengaluru', name_hi: 'बेंगलुरु',
      venues: [['Kanteerava Stadium Grounds', 'कंतीरवा स्टेडियम मैदान', 'Kanteerava Stadium, Bengaluru, Karnataka 560001', 'कंतीरवा स्टेडियम, बेंगलुरु, कर्नाटक 560001']],
    }],
  },
  {
    code: 'DL', name_en: 'Delhi', name_hi: 'दिल्ली',
    cities: [{
      name_en: 'New Delhi', name_hi: 'नई दिल्ली',
      venues: [['Pragati Maidan', 'प्रगति मैदान', 'Pragati Maidan, New Delhi, Delhi 110001', 'प्रगति मैदान, नई दिल्ली, दिल्ली 110001']],
    }],
  },
];

const YATRA_TICKETS = [
  {
    slug: 'pandal-darshan',
    name_en: 'Pandal Darshan',
    name_hi: 'पंडाल दर्शन',
    description_en: 'A reserved place inside the main pandal for the one-day Sundarkand path.',
    description_hi: 'एक दिवसीय सुंदरकांड पाठ के लिए मुख्य पंडाल के अंदर आरक्षित स्थान।',
    price: 500,
    original_price: null,
    default_capacity: 1000,
    valid_days: 1,
    inclusions: [
      L('Reserved seat inside the main pandal', 'मुख्य पंडाल के अंदर आरक्षित सीट'),
      L('Sundarkand path participation', 'सुंदरकांड पाठ में सहभागिता'),
      L('Prasad and aarti', 'प्रसाद और आरती'),
      L('Entry from 7:00 AM', 'सुबह 7:00 बजे से प्रवेश'),
    ],
    badge_en: 'Main pandal',
    badge_hi: 'मुख्य पंडाल',
    sort_order: 1,
  },
  {
    slug: 'visitor-entry',
    name_en: 'Visitor Entry',
    name_hi: 'दर्शक प्रवेश',
    description_en: 'Entry to the venue with live screening of the path and prasad counter access.',
    description_hi: 'स्थल में प्रवेश, पाठ की लाइव स्क्रीनिंग और प्रसाद काउंटर तक पहुँच।',
    price: 200,
    original_price: null,
    default_capacity: 2000,
    valid_days: 1,
    inclusions: [
      L('Visitor entry to the venue', 'स्थल में दर्शक प्रवेश'),
      L('Live screening of the path', 'पाठ की लाइव स्क्रीनिंग'),
      L('Prasad counter access', 'प्रसाद काउंटर तक पहुँच'),
      L('Entry from 7:00 AM', 'सुबह 7:00 बजे से प्रवेश'),
    ],
    badge_en: 'Visitor entry',
    badge_hi: 'दर्शक प्रवेश',
    sort_order: 2,
  },
];

const EXPO_TICKETS = [
  {
    slug: 'rajsuya-registration',
    name_en: 'Rajsuya Yagya Registration',
    name_hi: 'राजसूय यज्ञ रजिस्ट्रेशन',
    description_en: 'Participant registration for the Rajsuya Yagya at the Adhyatmik Bharat Expo, Delhi.',
    description_hi: 'आध्यात्मिक भारत एक्स्पो, दिल्ली में राजसूय यज्ञ के लिए प्रतिभागी रजिस्ट्रेशन।',
    price: 200000,
    original_price: null,
    default_capacity: 108,
    valid_days: 3,
    inclusions: [
      L('Participation in the Rajsuya Yagya', 'राजसूय यज्ञ में सहभागिता'),
      L('Reserved seating for all three days', 'तीनों दिन आरक्षित बैठक'),
      L('Name included in the yagya sankalp', 'यज्ञ संकल्प में नाम सम्मिलित'),
      L('Special prasad and memento', 'विशेष प्रसाद और स्मृति-चिह्न'),
      L('Expo VIP access', 'एक्स्पो वीआईपी प्रवेश'),
    ],
    badge_en: 'Sacred yagya',
    badge_hi: 'पवित्र यज्ञ',
    sort_order: 1,
  },
  {
    slug: 'expo-visitor',
    name_en: 'Expo Visitor Pass',
    name_hi: 'एक्स्पो दर्शक पास',
    description_en: 'Three-day visitor access to darshan, discourses, yoga sessions and the spiritual bazaar.',
    description_hi: 'दर्शन, प्रवचन, योग सत्र और आध्यात्मिक बाज़ार के लिए तीन दिन का दर्शक प्रवेश।',
    price: 499,
    original_price: null,
    default_capacity: 5000,
    valid_days: 3,
    inclusions: [
      L('All three days of the expo', 'एक्स्पो के तीनों दिन'),
      L('Darshan and discourse halls', 'दर्शन एवं प्रवचन हॉल'),
      L('Yoga and meditation sessions', 'योग एवं ध्यान सत्र'),
      L('Spiritual bazaar access', 'आध्यात्मिक बाज़ार में प्रवेश'),
    ],
    badge_en: 'Expo pass',
    badge_hi: 'एक्स्पो पास',
    sort_order: 2,
  },
];

async function seedAdmin() {
  if (!config.admin.email || !config.admin.password) {
    console.log('Skipping admin seed — ADMIN_EMAIL / ADMIN_PASSWORD not set.');
    return;
  }
  const hash = await bcrypt.hash(config.admin.password, 12);
  await query(
    `INSERT INTO admins (email, password_hash, name, role)
     VALUES (?, ?, ?, 'owner')
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), name = VALUES(name)`,
    [config.admin.email.toLowerCase(), hash, config.admin.name],
  );
  console.log(`Admin ready: ${config.admin.email}`);
}

async function seedContent() {
  for (const [key, value] of Object.entries(CONTENT)) {
    await query(
      `INSERT INTO event_content (content_key, value_json) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE content_key = content_key`,
      [key, JSON.stringify(value)],
    );
  }
  console.log(`Content ready: ${Object.keys(CONTENT).length} sections`);
}

async function seedEvents() {
  const events = [
    {
      slug: 'mahi-sundarkand',
      kind: 'yatra',
      name_en: 'Mahi Sundarkand',
      name_hi: 'माहि सुंदरकांड',
      tagline_en: 'One day. Ten cities. Ten states.',
      tagline_hi: 'एक दिन। दस शहर। दस राज्य।',
      description_en: 'A simultaneous Sundarkand path across ten cities in ten states, with 1,000 devotees in the main pandal of every city and visitor entry for 30,000 attendees.',
      description_hi: 'दस राज्यों के दस शहरों में एक साथ सुंदरकांड पाठ, हर शहर के मुख्य पंडाल में 1,000 भक्त और 30,000 प्रतिभागियों के लिए दर्शक प्रवेश।',
      date_label_en: 'Saturday, 12 June 2027',
      date_label_hi: 'शनिवार, 12 जून 2027',
      starts_on: '2027-06-12',
      ends_on: '2027-06-12',
      sale_ends_at: '2027-06-11 23:59:00',
      tickets: YATRA_TICKETS,
    },
    {
      slug: 'adhyatmik-bharat-expo',
      kind: 'expo',
      name_en: 'Adhyatmik Bharat Expo',
      name_hi: 'आध्यात्मिक भारत एक्स्पो',
      tagline_en: '27–29 August 2027 · Pragati Maidan, New Delhi',
      tagline_hi: '27–29 अगस्त 2027 · प्रगति मैदान, नई दिल्ली',
      description_en: 'Three days of darshan, discourse, Rajsuya Yagya, yoga and a spiritual bazaar at Pragati Maidan, New Delhi.',
      description_hi: 'प्रगति मैदान, नई दिल्ली में दर्शन, प्रवचन, राजसूय यज्ञ, योग और आध्यात्मिक बाज़ार के तीन दिन।',
      date_label_en: '27–29 August 2027',
      date_label_hi: '27–29 अगस्त 2027',
      starts_on: '2027-08-27',
      ends_on: '2027-08-29',
      sale_ends_at: '2027-08-26 23:59:00',
      tickets: EXPO_TICKETS,
    },
  ];

  for (const event of events) {
    await query(
      `INSERT INTO events
        (slug, kind, name_en, name_hi, tagline_en, tagline_hi, description_en, description_hi,
         date_label_en, date_label_hi, starts_on, ends_on, sale_ends_at, active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE
         name_en = VALUES(name_en), name_hi = VALUES(name_hi),
         tagline_en = VALUES(tagline_en), tagline_hi = VALUES(tagline_hi)`,
      [
        event.slug, event.kind, event.name_en, event.name_hi, event.tagline_en, event.tagline_hi,
        event.description_en, event.description_hi, event.date_label_en, event.date_label_hi,
        event.starts_on, event.ends_on, event.sale_ends_at, event.kind === 'yatra' ? 1 : 2,
      ],
    );

    const [row] = await query('SELECT id FROM events WHERE slug = ?', [event.slug]);
    for (const ticket of event.tickets) {
      await query(
        `INSERT INTO event_ticket_types
          (event_id, slug, name_en, name_hi, description_en, description_hi, price, original_price,
           default_capacity, valid_days, inclusions, badge_en, badge_hi, sort_order, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           name_en = VALUES(name_en), name_hi = VALUES(name_hi),
           description_en = VALUES(description_en), description_hi = VALUES(description_hi),
           price = VALUES(price), original_price = VALUES(original_price),
           default_capacity = VALUES(default_capacity), valid_days = VALUES(valid_days),
           inclusions = VALUES(inclusions),
           badge_en = VALUES(badge_en), badge_hi = VALUES(badge_hi), sort_order = VALUES(sort_order)`,
        [
          row.id, ticket.slug, ticket.name_en, ticket.name_hi, ticket.description_en, ticket.description_hi,
          ticket.price, ticket.original_price, ticket.default_capacity, ticket.valid_days ?? 1,
          JSON.stringify(ticket.inclusions),
          ticket.badge_en, ticket.badge_hi, ticket.sort_order,
        ],
      );
    }
  }
  console.log(`Events ready: ${events.length}`);
}

async function seedLocations() {
  for (let stateIndex = 0; stateIndex < STATES.length; stateIndex += 1) {
    const state = STATES[stateIndex];
    await query(
      `INSERT INTO event_states (code, name_en, name_hi, sort_order, active)
       VALUES (?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE name_en = VALUES(name_en), name_hi = VALUES(name_hi)`,
      [state.code, state.name_en, state.name_hi, stateIndex + 1],
    );
    const [stateRow] = await query('SELECT id FROM event_states WHERE code = ?', [state.code]);

    for (let cityIndex = 0; cityIndex < state.cities.length; cityIndex += 1) {
      const city = state.cities[cityIndex];
      const [existingCity] = await query(
        'SELECT id FROM event_cities WHERE state_id = ? AND name_en = ? LIMIT 1',
        [stateRow.id, city.name_en],
      );
      let cityId = existingCity?.id;
      if (!cityId) {
        const result = await query(
          'INSERT INTO event_cities (state_id, name_en, name_hi, sort_order, active) VALUES (?, ?, ?, ?, 1)',
          [stateRow.id, city.name_en, city.name_hi, cityIndex + 1],
        );
        cityId = result.insertId;
      }

      for (let venueIndex = 0; venueIndex < city.venues.length; venueIndex += 1) {
        const [nameEn, nameHi, addressEn, addressHi] = city.venues[venueIndex];
        const [existingVenue] = await query(
          'SELECT id FROM event_venues WHERE city_id = ? AND name_en = ? LIMIT 1',
          [cityId, nameEn],
        );
        if (!existingVenue) {
          await query(
            `INSERT INTO event_venues (city_id, name_en, name_hi, address_en, address_hi, sort_order, active)
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [cityId, nameEn, nameHi, addressEn, addressHi, venueIndex + 1],
          );
        }
      }
    }
  }
  console.log(`Locations ready: ${STATES.length} states`);
}

async function seedSchedules() {
  const [yatra] = await query("SELECT id FROM events WHERE slug = 'mahi-sundarkand' LIMIT 1");
  const [expo] = await query("SELECT id FROM events WHERE slug = 'adhyatmik-bharat-expo' LIMIT 1");
  if (!yatra || !expo) throw new Error('Events must be seeded before schedules.');

  const yatraTickets = await query('SELECT id, slug FROM event_ticket_types WHERE event_id = ?', [yatra.id]);
  const ticketId = (slug) => yatraTickets.find((ticket) => ticket.slug === slug)?.id;

  const [existingYatra] = await query('SELECT COUNT(*) AS n FROM event_schedules WHERE event_id = ?', [yatra.id]);
  if (Number(existingYatra.n) === 0) {
    const venues = await query(
      `SELECT v.id AS venue_id, v.city_id, c.state_id, c.name_en AS city_en
       FROM event_venues v
       JOIN event_cities c ON c.id = v.city_id
       JOIN event_states s ON s.id = c.state_id
       WHERE s.code <> 'DL'
       ORDER BY s.sort_order, v.sort_order`,
    );
    const jaipurVenueCount = Number(
      (await query(
        `SELECT COUNT(*) AS n FROM event_venues v JOIN event_cities c ON c.id = v.city_id
         WHERE c.name_en = 'Jaipur'`,
      ))[0].n,
    );

    for (const venue of venues) {
      const result = await query(
        `INSERT INTO event_schedules
          (event_id, state_id, city_id, venue_id, event_date, start_time, end_time, sale_ends_at, note_en, note_hi, active)
         VALUES (?, ?, ?, ?, '2027-06-12', '07:00:00', '13:00:00', '2027-06-11 23:59:00',
                 'Gates open at 6:00 AM. Path begins at 7:00 AM.', 'गेट सुबह 6:00 बजे खुलेंगे। पाठ सुबह 7:00 बजे शुरू होगा।', 1)`,
        [yatra.id, venue.state_id, venue.city_id, venue.venue_id],
      );
      const isJaipur = venue.city_en === 'Jaipur' && jaipurVenueCount > 1;
      const pandalCapacity = isJaipur ? 500 : 1000;
      const visitorCapacity = isJaipur ? 1000 : 2000;
      await query(
        'INSERT INTO event_schedule_capacities (schedule_id, ticket_type_id, capacity) VALUES (?, ?, ?), (?, ?, ?)',
        [result.insertId, ticketId('pandal-darshan'), pandalCapacity, result.insertId, ticketId('visitor-entry'), visitorCapacity],
      );
    }
    console.log('Yatra schedules ready.');
  } else {
    console.log('Yatra schedules already exist — left untouched.');
  }

  const [existingExpo] = await query('SELECT COUNT(*) AS n FROM event_schedules WHERE event_id = ?', [expo.id]);
  if (Number(existingExpo.n) === 0) {
    const [delhi] = await query("SELECT id FROM event_states WHERE code = 'DL' LIMIT 1");
    const [city] = await query('SELECT id FROM event_cities WHERE state_id = ? LIMIT 1', [delhi.id]);
    const [venue] = await query('SELECT id FROM event_venues WHERE city_id = ? LIMIT 1', [city.id]);
    const result = await query(
      `INSERT INTO event_schedules
        (event_id, state_id, city_id, venue_id, event_date, end_date, start_time, end_time, sale_ends_at, active)
       VALUES (?, ?, ?, ?, '2027-08-27', '2027-08-29', '10:00:00', '20:00:00', '2027-08-26 23:59:00', 1)`,
      [expo.id, delhi.id, city.id, venue.id],
    );
    const expoTickets = await query('SELECT id, slug FROM event_ticket_types WHERE event_id = ?', [expo.id]);
    for (const ticket of expoTickets) {
      const capacity = ticket.slug === 'rajsuya-registration' ? 108 : 5000;
      await query(
        'INSERT INTO event_schedule_capacities (schedule_id, ticket_type_id, capacity) VALUES (?, ?, ?)',
        [result.insertId, ticket.id, capacity],
      );
    }
    console.log('Expo schedule ready.');
  } else {
    console.log('Expo schedule already exists — left untouched.');
  }
}

async function main() {
  await seedAdmin();
  await seedContent();
  await seedEvents();
  await seedLocations();
  await seedSchedules();
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
