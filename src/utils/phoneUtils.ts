/**
 * Utilities for formatting phone numbers to the standard Twilio E.164 style:
 * +1 ___-___-____ (+1 XXX-XXX-XXXX)
 */

export const formatPhoneNumber = (value: string): string => {
  if (!value) return '';

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
 * Returns true if the phone number has all 10 national digits entered.
 */
export const isCompletePhoneNumber = (value: string): boolean => {
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

