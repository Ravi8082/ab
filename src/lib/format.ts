const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatEventDate(iso: string, lang: 'en' | 'hi'): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  if (lang === 'hi') {
    const HI_MONTHS = ['जन', 'फर', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुल', 'अग', 'सित', 'अक्ट', 'नव', 'दिस'];
    return `${dd} ${HI_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
  return `${dd} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatTime(hhmm: string): string {
  const [hRaw, m] = hhmm.split(':');
  const h = Number(hRaw);
  if (Number.isNaN(h)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}
