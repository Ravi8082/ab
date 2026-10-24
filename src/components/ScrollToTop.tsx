import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const PENDING_KEY = 'ab-pending-section';

/** Scrolls to the top on route change, or to a section another page asked for once it exists. */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    const target = sessionStorage.getItem(PENDING_KEY);
    if (!target) {
      window.scrollTo(0, 0);
      return;
    }

    sessionStorage.removeItem(PENDING_KEY);
    let tries = 0;
    const timer = window.setInterval(() => {
      const element = document.getElementById(target);
      if (element) {
        window.clearInterval(timer);
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if ((tries += 1) > 24) {
        window.clearInterval(timer);
        window.scrollTo(0, 0);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [pathname]);

  return null;
}
