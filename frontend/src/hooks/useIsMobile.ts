import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(pointer: coarse) and (max-width: 900px)';

// Pointer capability, not just width, so a touch-primary phone is detected correctly while a
// desktop browser window resized to be narrow still gets the desktop UI. Live-updates on
// resize/rotation via the media query's own change event, rather than a one-time check.
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
