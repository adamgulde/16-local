import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 900px), (pointer: coarse) and (max-width: 1024px)';

// True for smartphones, tablets, or any desktop browser window resized to <= 900px.
// Live-updates on window resize/rotation via the media query's own change event.
export const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
};
