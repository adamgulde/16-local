// Ports PhoneNumbers.clean (backend) so stored numbers match what the server used to store.

/** US 10 or 11-with-leading-1 digits become "+1 XXX-XXX-XXXX"; anything else is trimmed and kept. */
export const cleanPhone = (phone: string | null | undefined): string | null => {
  if (phone == null) return null;
  const trimmed = phone.trim();
  if (trimmed === '') return null;
  let digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('1') && digits.length === 11) digits = digits.slice(1);
  if (digits.length === 10) return `+1 ${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return trimmed;
};

/** Dedup key: last 10 digits, so "+1 555-123-4567" and "5551234567" match. Null if too short. */
export const phoneKey = (phone: string | null | undefined): string | null => {
  if (phone == null) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
};
