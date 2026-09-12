/**
 * Utilities for formatting phone numbers to the standard Twilio E.164 style:
 * +1 ___-___-____ (+1 XXX-XXX-XXXX)
 */

export const formatPhoneNumber = (value: string): string => {
  if (!value) return '';

  const trimmed = value.trim();
  if (trimmed.toLowerCase().startsWith('user') || trimmed.startsWith('#')) {
    return value;
  }

  if (value === '+1' || value === '+' || value === '') {
    return '';
  }
  if (value === '1' || value === '+1 ') {
    return '+1 ';
  }

  // Extract all digits
  let digits = value.replace(/\D/g, '');

  // Strip leading 1 if the input starts with +1, has 11 digits starting with 1,
  // or if the user typed 1 as the first digit (country code)
  if (value.trim().startsWith('+1') && digits.startsWith('1')) {
    digits = digits.slice(1);
  } else if (digits.startsWith('1') && (digits.length === 11 || value.trim().startsWith('1'))) {
    digits = digits.slice(1);
  }

  // Cap at 10 national digits
  digits = digits.slice(0, 10);

  if (digits.length === 0) {
    return '';
  }

  let formatted = '+1 ';
  if (digits.length <= 3) {
    formatted += digits;
  } else if (digits.length <= 6) {
    formatted += `${digits.slice(0, 3)}-${digits.slice(3)}`;
  } else {
    formatted += `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return formatted;
};

/**
 * Checks if a string is a default user shortcut:
 * e.g. "0", "1", "100", "user 1", "user1", "#1", "+1 0", "+1 100"
 */
export const isDefaultUserShortcut = (value: string): boolean => {
  if (!value) return false;
  let trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith('user')) {
    trimmed = trimmed.substring(4).trim();
  } else if (trimmed.startsWith('#')) {
    trimmed = trimmed.substring(1).trim();
  } else if (trimmed.startsWith('+1')) {
    trimmed = trimmed.substring(2).trim();
  }
  if (/^\d{1,3}$/.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    return num >= 0 && num <= 105;
  }
  return false;
};

/**
 * Resolves a default user shortcut to "+1 555-000-XXXX" or returns the formatted phone number.
 */
export const resolvePhoneNumberOrShortcut = (value: string): string => {
  if (!value) return '';
  let trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith('user')) {
    trimmed = trimmed.substring(4).trim();
  } else if (trimmed.startsWith('#')) {
    trimmed = trimmed.substring(1).trim();
  } else if (trimmed.startsWith('+1')) {
    const rest = trimmed.substring(2).trim();
    if (/^\d{1,3}$/.test(rest)) {
      trimmed = rest;
    }
  }
  if (/^\d{1,3}$/.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    if (num >= 0 && num <= 105) {
      return `+1 555-000-${num.toString().padStart(4, '0')}`;
    }
  }
  return formatPhoneNumber(value);
};

/**
 * Returns true if the phone number has all 10 national digits entered, or is a valid default user shortcut.
 */
export const isCompletePhoneNumber = (value: string): boolean => {
  if (isDefaultUserShortcut(value)) return true;
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('1') && digits.length > 10) {
    digits = digits.slice(1);
  }
  return digits.length === 10;
};

/**
 * Formats a phone number for display (or returns raw if not 10 digits).
 */
export const formatPhoneNumberDisplay = (phone: string | null | undefined): string => {
  if (!phone) return '';
  const formatted = formatPhoneNumber(phone);
  return formatted || phone;
};
