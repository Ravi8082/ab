import { useEffect, useRef, useState } from 'react';

export function useCountUp(target: number, start: boolean, duration = 2000) {
  const [value, setValue] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!start) return;
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, start, duration]);

  return value;
}
