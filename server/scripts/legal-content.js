const L = (en, hi) => ({ en, hi });

/** Default bilingual legal pages. Seeded once by setup-db and editable by admins from Page content. */
export const LEGAL_CONTENT = {
  legal_terms: {
    title: L('Terms & conditions', 'नियम एवं शर्तें'),
    intro: L(
      'These terms apply to every pass booked on this site. Please read them before you pay — booking a pass means you accept them.',
      'इस साइट पर बुक किए गए हर पास पर ये नियम लागू होते हैं। भुगतान से पहले इन्हें ज़रूर पढ़ें — पास बुक करने का अर्थ है कि आप इनसे सहमत हैं।',
    ),
    sections: [
      {
        heading: L('Booking and payment', 'बुकिंग और भुगतान'),
        body: L(
          'Seats are held for 30 minutes after a booking is created and are confirmed only when payment is received. Your email must be verified with the 6-digit code we send before payment. A booking reference is issued immediately — keep it safe.',
          'बुकिंग बनने के बाद सीटें 30 मिनट तक सुरक्षित रहती हैं और केवल भुगतान प्राप्त होने पर निश्चित होती हैं। भुगतान से पहले आपके ई-मेल पर भेजा 6 अंकों का कोड सत्यापित करना अनिवार्य है। बुकिंग संदर्भ तुरंत मिल जाता है — इसे संभालकर रखें।',
        ),
      },
      {
        heading: L('Prices and dated price slabs', 'कीमतें और दिनांक-आधारित मूल्य'),
        body: L(
          'Ticket prices are set by the organiser and may rise on scheduled dates. The price shown at the moment you book is the price charged; a price change after your booking does not affect a pass you have already paid for. Any struck-through price is the regular price, not a misprint.',
          'टिकट मूल्य आयोजक द्वारा निर्धारित होते हैं और निर्धारित तिथियों पर बढ़ सकते हैं। बुकिंग के समय जो मूल्य दिखता है वही वसूला जाता है; भुगतान के बाद मूल्य बदलने पर आपके पासित पास पर असर नहीं पड़ता। रेखांकित मूल्य सामान्य मूल्य है।',
        ),
      },
      {
        heading: L('Pass validity and entry', 'पास की मान्यता और प्रवेश'),
        body: L(
          'A single-day pass gives one entry on the event date of your city. A multi-day pass gives one entry on each event day it covers — the QR is checked at the gate and used days cannot be re-entered. Passes are non-transferable; the name on the pass must match the person entering.',
          'एक-दिवसीय पास आपके शहर की घटना तिथि पर एक प्रवेश देता है। बहु-दिवसीय पास हर अंतर्गत घटना दिन एक प्रवेश देता है — गेट पर QR जाँचा जाता है और उपयोग हुए दिन दोबारा प्रवेश नहीं मिलता। पास हस्तांतरणीय नहीं है; पास पर नाम और प्रवेश करने वाला व्यक्ति एक ही होना चाहिए।',
        ),
      },
      {
        heading: L('Venue rules', 'स्थल के नियम'),
        body: L(
          'Follow the venue\'s safety, dress and sanitising instructions. Weapons, outside food and liquor as prohibited by the venue, and any activity that disturbs the event may lead to entry being withdrawn without refund.',
          'स्थल के सुरक्षा, वेशभूषा एवं स्वच्छता निर्देशों का पालन करें। स्थल द्वारा निषिद्ध हथियार, बाह्य भोजन और शराब, तथा घटना में बाधा डालने वाली किसी भी गतिविधि पर प्रवेश बिना धनवापसी रद्द किया जा सकता है।',
        ),
      },
      {
        heading: L('Changes, cancellation and refunds', 'बदलाव, रद्दीकरण और धनवापसी'),
        body: L(
          'City and ticket upgrades are subject to seat availability. Refunds follow the refund policy linked at the foot of this page. If an event is cancelled or a city schedule is called off by the organiser, paid passes are refunded or converted as announced.',
          'शहर और टिकट बदलाव सीट उपलब्धता पर निर्भर हैं। धनवापसी इस पृष्ठ के निचले हिस्से में दी धनवापसी नीति के अनुसार होगी। यदि घटना या किसी शहर का कार्यक्रम रद्द होता है, तो पासित धन घोषित अनुसार वापस या परिवर्तित किया जाएगा।',
        ),
      },
      {
        heading: L('Your data', 'आपका डेटा'),
        body: L(
          'Name, email and mobile are used to issue and verify your pass and to send entry instructions. We do not sell your data. See the privacy policy for full details.',
          'नाम, ई-मेल और मोबाइल आपका पास बनाने, सत्यापित करने और प्रवेश जानकारी भेजने के लिए उपयोग होते हैं। हम आपका डेटा बेचते नहीं हैं। पूर्ण विवरण के लिए गोपनीयता नीति देखें।',
        ),
      },
    ],
  },
  legal_privacy: {
    title: L('Privacy policy', 'गोपनीयता नीति'),
    intro: L(
      'We collect the least data needed to let you enter the event and to keep the booking safe.',
      'हम इतना ही डेटा एकत्र करते हैं जितना आपको घटना में प्रवेश देने और बुकिंग सुरक्षित रखने के लिए आवश्यक है।',
    ),
    sections: [
      {
        heading: L('What we store', 'हम क्या सुरक्षित करते हैं'),
        body: L(
          'Your booking name, email, mobile number, city, ticket type, quantity and payment status. OTP codes are stored only as one-way hashes and expire in 10 minutes. Payment gateway card details never reach this site.',
          'आपका बुकिंग नाम, ई-मेल, मोबाइल, शहर, टिकट प्रकार, मात्रा और भुगतान स्थिति। OTP केवल हैश के रूप में रहते हैं और 10 मिनट में समाप्त हो जाते हैं। भुगतान गेटवे के कार्ड विवरण इस साइट पर कभी नहीं आते।',
        ),
      },
      {
        heading: L('Cookies and local storage', 'कुकीज़ और लोकल स्टोरेज'),
        body: L(
          'This site works without marketing cookies. Only strictly necessary cookies (admin sign-in session) are always used. Optional analytics are set only after you choose "Accept all" in the cookie banner, and your choice is saved in your browser storage; you can change it anytime.',
          'यह साइट मार्केटिंग कुकीज़ के बिना चलती है। केवल अति-आवश्यक कुकीज़ (एडमिन सत्र) सदा उपयोग होती हैं। वैकल्पिक एनालिटिक्स तभी चालू होती हैं जब आप कुकी बैनर में "सभी स्वीकार करें" चुनते हैं; आपका विकल्प ब्राउज़र स्टोरेज में रहता है और आप इसे कभी भी बदल सकते हैं।',
        ),
      },
      {
        heading: L('Who sees your data', 'आपका डेटा कौन देखता है'),
        body: L(
          'Our event team and the gate staff of the city you booked, who can see your name, ticket and whether your QR has been used. Our payment processor and email provider act only on our instructions.',
          'हमारी घटना टीम और आपके शहर के गेट स्टाफ़, जो आपका नाम, टिकट और QR उपयोग की स्थिति देख सकते हैं। हमारा भुगतान एवं ई-मेल सेवाप्रदाता केवल हमारे निर्देश पर कार्य करता है।',
        ),
      },
      {
        heading: L('How long we keep it', 'कब तक सुरक्षित रहता है'),
        body: L(
          'Bookings, payment records and gate check-in logs are kept for the event and the accounting period that follows, then deleted or anonymised as required by law.',
          'बुकिंग, भुगतान रिकॉर्ड और गेट जाँन लिपि घटना और उसके बाद की लेखा अवधि तक रखी जाती हैं, फिर विधि अनुसार हटाई या गुमनाम की जाती हैं।',
        ),
      },
      {
        heading: L('Your choices', 'आपके विकल्प'),
        body: L(
          'Write to the help desk email at the foot of the home page to see, correct or delete your booking data, or to withdraw consent. We answer within a few working days.',
          'पृष्ठ के निचले हिस्से में दिए सहायता ई-मेल पर लिखकर आप अपना डेटा देख, सुधार या हटवा सकते हैं, या सहमति वापस ले सकते हैं। हम कुछ कार्य दिवसों में उत्तर देते हैं।',
        ),
      },
    ],
  },
  legal_refund: {
    title: L('Refund policy', 'धनवापसी नीति'),
    intro: L(
      'Refunds are processed to the same payment method you used. Please read the window that applies to your ticket.',
      'धनवापसी उसी भुगतान माध्यम से होती है जिसका आपने उपयोग किया। कृपया अपने टिकट पर लागू अवधि पढ़ें।',
    ),
    sections: [
      {
        heading: L('Cancellation window', 'रद्दीकरण अवधि'),
        body: L(
          'Cancellation requests made up to 15 days before your city date are refunded after a processing charge of up to 5%. Requests within 15 days of the event, or after the event date, are not refundable.',
          'आपकी शहर तिथि से 15 दिन या उससे पहले किए गए अनुरोध पर 5% तक प्रोसेसिंग शुल्क काटकर धनवापसी होती है। घटना से 15 दिन के भीतर या घटना के बाद के अनुरोध धनवापसी-योग्य नहीं हैं।',
        ),
      },
      {
        heading: L('Event cancelled by the organiser', 'आयोजक द्वारा घटना रद्द'),
        body: L(
          'If the event or your city schedule is cancelled, paid passes are refunded in full with no processing charge, or converted to another city where offered.',
          'यदि घटना या आपके शहर का कार्यक्रम रद्द होता है, तो पूर्ण धनवापसी बिना प्रोसेसिंग शुल्क होती है, या प्रस्ताव पर दूसरे शहर में परिवर्तन किया जाता है।',
        ),
      },
      {
        heading: L('Wrong ticket or duplicate payment', 'गलत टिकट या दोहरा भुगतान'),
        body: L(
          'Booked the wrong city, date or pass type? Tell the help desk within 48 hours of payment and we will reissue or refund. Duplicate payments are refunded automatically once verified.',
          'गलत शहर, तिथि या पास बुक हो गया? भुगतान के 48 घंटे में सहायता डेस्क को बताएँ; हम पुनः जारी या धनवापसी करेंगे। दोहरा भुगतान सत्यापन पर स्वतः वापस होता है।',
        ),
      },
      {
        heading: L('Not used, no-show', 'उपयोग नहीं / अनुपस्थिति'),
        body: L(
          'If you do not reach the venue, single-day passes are not refundable. Unused days of a multi-day pass are treated per the terms above.',
          'स्थल पर न पहुँचने पर एक-दिवसीय पास धनवापसी-योग्य नहीं है। बहु-दिवसीय पास के बिना-उपयोग दिन ऊपर दिए नियमों के अनुसार होंगे।',
        ),
      },
      {
        heading: L('How long it takes', 'कितना समय लगता है'),
        body: L(
          'Approved refunds reach your account in 5–10 working days, subject to your bank or card issuer. The refund reference is sent to your booked email.',
          'स्वीकृत धनवापसी 5–10 कार्य दिवसों में, आपके बैंक या कार्ड जारीकर्ता अनुसार, खाते में पहुँचती है। धनवापसी संदर्भ आपके बुकिंग ई-मेल पर भेजा जाता है।',
        ),
      },
    ],
  },
};
