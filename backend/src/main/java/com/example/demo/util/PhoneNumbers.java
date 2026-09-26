package com.example.demo.util;

/**
 * Normalizes phone numbers the same way everywhere they're accepted from a client — originally
 * {@code AuthController#cleanPhone}, extracted so contacts/share-requests (P2/P3) apply the exact
 * same rule instead of drifting from it.
 */
public final class PhoneNumbers {

    private PhoneNumbers() {
    }

    /** US-shaped 10 (or 11-with-leading-1) digit numbers become "+1 XXX-XXX-XXXX"; anything else
     * is returned trimmed, unchanged — same fallback AuthController has always used. */
    public static String clean(String phone) {
        if (phone == null) {
            return null;
        }
        String trimmed = phone.trim();
        if (trimmed.isEmpty()) {
            return null;
        }

        String digits = trimmed.replaceAll("\\D", "");
        if (digits.startsWith("1") && digits.length() == 11) {
            digits = digits.substring(1);
        }
        if (digits.length() == 10) {
            return String.format("+1 %s-%s-%s",
                    digits.substring(0, 3),
                    digits.substring(3, 6),
                    digits.substring(6));
        }
        return trimmed;
    }
}
