import { useCallback, useEffect, useRef, useState } from 'react';

export interface AntiSpamOptions {
  /** Cooldown in milliseconds after completion before allowing another submission. Defaults to 400ms. */
  cooldownMs?: number;
}

/**
 * Hook to protect submit buttons and handlers from rapid double-clicks,
 * spamming, and concurrent submissions.
 *
 * Provides:
 * - Immediate synchronous mutex via useRef to drop concurrent/duplicate invocations.
 * - Stable handleSubmit reference via callback ref to avoid unnecessary re-renders.
 * - `isSubmitting` React state for disabling buttons and showing loading indicators.
 * - Post-submission cooldown window to prevent rapid successive submissions.
 */
export const useAntiSpamSubmit = <T extends unknown[], R>(
  submitFn: (...args: T) => Promise<R> | R,
  options: AntiSpamOptions = {}
) => {
  const { cooldownMs = 400 } = options;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isLockedRef = useRef(false);
  const isMountedRef = useRef(true);
  const submitFnRef = useRef(submitFn);
  submitFnRef.current = submitFn;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleSubmit = useCallback(
    async (...args: T): Promise<R | undefined> => {
      // Synchronous check: if an action is already in flight or in cooldown, drop the click immediately
      if (isLockedRef.current) {
        return undefined;
      }

      isLockedRef.current = true;
      setIsSubmitting(true);

      try {
        return await submitFnRef.current(...args);
      } finally {
        if (cooldownMs > 0) {
          window.setTimeout(() => {
            isLockedRef.current = false;
            if (isMountedRef.current) {
              setIsSubmitting(false);
            }
          }, cooldownMs);
        } else {
          isLockedRef.current = false;
          if (isMountedRef.current) {
            setIsSubmitting(false);
          }
        }
      }
    },
    [cooldownMs]
  );

  return { isSubmitting, handleSubmit };
};
