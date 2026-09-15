import { useCallback, useEffect, useState } from 'react';

/**
 * Hook to manage OTP resend cooldown timers (e.g. 30 seconds),
 * preventing users from spamming verification code requests.
 */
export const useOtpCooldown = (defaultSeconds = 30) => {
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const startCooldown = useCallback((seconds = defaultSeconds) => {
    setCooldown(seconds);
  }, [defaultSeconds]);

  const resetCooldown = useCallback(() => {
    setCooldown(0);
  }, []);

  return {
    cooldown,
    isCoolingDown: cooldown > 0,
    startCooldown,
    resetCooldown,
  };
};
