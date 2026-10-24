import { motion } from 'framer-motion';
import { useApp } from '@/context/AppContext';

interface Moment {
  time: { en: string; hi: string };
  title: { en: string; hi: string };
  detail: { en: string; hi: string };
}

const MOMENTS: Moment[] = [
  {
    time: { en: '06:00 AM', hi: 'प्रातः ६:००' },
    title: { en: 'Mangala Aarti', hi: 'मंगला आरती' },
    detail: { en: 'The yatra begins with the first lamp.', hi: 'यात्रा की पहली आरती दीप से।' },
  },
  {
    time: { en: '09:00 AM', hi: 'प्रातः ९:००' },
    title: { en: 'Sankalp', hi: 'संकल्प' },
    detail: { en: 'Collective vow taken by every city.', hi: 'हर शहर में सामूहिक संकल्प।' },
  },
  {
    time: { en: '10:30 AM', hi: 'सुबह १०:३०' },
    title: { en: 'Mahi Sundarkand Path', hi: 'माहि सुंदरकांड पाठ' },
    detail: { en: 'The full recitation, chorus by chorus.', hi: 'संपूर्ण पाठ, समूहगान के साथ।' },
  },
  {
    time: { en: '01:00 PM', hi: 'दोपहर १:००' },
    title: { en: 'Prasad Seva', hi: 'प्रसाद सेवा' },
    detail: { en: 'Bhandara for all devotees present.', hi: 'उपस्थित सभी भक्तों के लिए भंडारा।' },
  },
  {
    time: { en: '06:30 PM', hi: 'संध्या ६:३०' },
    title: { en: 'Sandhya Aarti', hi: 'संध्या आरती' },
    detail: { en: 'Dusk aarti, ten cities at once.', hi: 'एक ही समय दस शहरों में आरती।' },
  },
  {
    time: { en: '08:00 PM', hi: 'रात्रि ८:००' },
    title: { en: 'Bhajan & Katha', hi: 'भजन एवं कथा' },
    detail: { en: 'Closing devotional gathering.', hi: 'भक्तिमय समापन सभा।' },
  },
];

export default function YatraRhythm() {
  const { lang } = useApp();

  return (
    <section className="section section--dark pattern-lotus">
      <div className="wrap section-inner">
        <div className="section-head">
          <span className="eyebrow eyebrow--light">
            {lang === 'en' ? 'The day, moment by moment' : 'दिन का अनुक्रम'}
          </span>
          <h2 className="font-display text-white">
            {lang === 'en' ? 'Ek Din, Ten Cities' : 'एक दिन, दस शहर'}
          </h2>
          <p>
            {lang === 'en'
              ? 'Every venue follows the same rhythm — from the first lamp to the last bhajan, all ten cities move together.'
              : 'हर स्थान पर यही अनुक्रम — पहला दीप से अंतिम भजन तक, दसों शहर साथ-साथ चलते हैं।'}
          </p>
        </div>

        <div className="relative">
          <div
            className="pointer-events-none absolute left-0 right-0 top-[26px] hidden h-px md:block"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(19,187,232,.45), rgba(255,210,31,.45), transparent)' }}
          />
          <motion.div
            className="grid gap-5 md:grid-cols-3"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={{ show: { transition: { staggerChildren: 0.09 } } }}
          >
            {MOMENTS.map((m, i) => (
              <motion.div
                key={m.title.en}
                variants={{
                  hidden: { opacity: 0, y: 26 },
                  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
                }}
                className="card--dark relative rounded-[24px] p-6"
              >
                <div className="mb-4 flex items-center gap-3">
                  <span className="relative grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full border border-sky/35 bg-sindoor-deep">
                    <span className="absolute inset-0 rounded-full border border-marigold/25" />
                    <span className="font-display text-lg text-marigold">{i + 1}</span>
                  </span>
                  <span className="font-ui text-xs uppercase tracking-[0.2em] text-sky">
                    {m.time[lang] ?? m.time.en}
                  </span>
                </div>
                <h3
                  className={`text-xl text-white ${lang === 'hi' ? 'font-devanagari' : 'font-display'}`}
                >
                  {m.title[lang] ?? m.title.en}
                </h3>
                <p className="mt-1.5 text-sm font-light leading-relaxed text-cream-on-dark/70">
                  {m.detail[lang] ?? m.detail.en}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
