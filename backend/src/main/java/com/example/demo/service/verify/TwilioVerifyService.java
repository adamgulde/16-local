package com.example.demo.service.verify;

import com.example.demo.ratelimit.RateLimitKeys;
import com.twilio.Twilio;
import com.twilio.exception.ApiException;
import com.twilio.rest.verify.v2.service.Verification;
import com.twilio.rest.verify.v2.service.VerificationCheck;
import com.example.demo.exception.BadRequestException;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Service for sending and verifying phone OTPs using the Twilio Verify v2 API,
 * with fallback to local mock generation in test/dev environments.
 */
@Slf4j
@Service
public class TwilioVerifyService {

    @Value("${twilio.account-sid:}")
    private String accountSid;

    @Value("${twilio.auth-token:}")
    private String authToken;

    @Value("${twilio.verify-service-sid:}")
    private String verifyServiceSid;

    /**
     * S3/bot-prevention fix-up: the "555-000-xxxx" test-number bypass (fixed code {@code 000000},
     * no SMS, no Twilio call) must never be reachable in production regardless of Twilio
     * configuration state — it previously fired unconditionally for any number matching that
     * pattern, letting a bot register unlimited accounts with zero SMS cost. Off by default;
     * {@code app.otp.test-numbers-enabled} turns it on only where explicitly wanted (dev/test).
     */
    @Value("${app.otp.test-numbers-enabled:false}")
    private boolean testNumbersEnabled;

    private boolean configured = false;

    private record DevVerifyEntry(String code, Instant expiresAt) {}
    private final Map<String, DevVerifyEntry> devVerifyStore = new ConcurrentHashMap<>();
    private final SecureRandom secureRandom = new SecureRandom();

    public TwilioVerifyService() {
    }

    public TwilioVerifyService(String accountSid, String authToken, String verifyServiceSid) {
        this.accountSid = accountSid;
        this.authToken = authToken;
        this.verifyServiceSid = verifyServiceSid;
        init();
    }

    @PostConstruct
    public void init() {
        if (accountSid != null) accountSid = sanitize(accountSid);
        if (authToken != null) authToken = sanitize(authToken);
        if (verifyServiceSid != null) verifyServiceSid = sanitize(verifyServiceSid);

        if (accountSid != null && !accountSid.isBlank()
                && authToken != null && !authToken.isBlank()
                && verifyServiceSid != null && !verifyServiceSid.isBlank()
                && !accountSid.startsWith("ACmock")
                && !verifyServiceSid.startsWith("VAmock")) {
            try {
                Twilio.init(accountSid, authToken);
                configured = true;
                log.info("Twilio Verify service initialized successfully (verifyServiceSid: {})", verifyServiceSid);
            } catch (Exception e) {
                log.error("Failed to initialize Twilio SDK for Verify: {}", e.getMessage());
                configured = false;
            }
        } else {
            configured = false;
            log.warn("Twilio Verify credentials not configured or in mock test mode; verification will run in local mock mode");
        }
    }

    private String sanitize(String value) {
        return value.trim().replace("\"", "").replace("'", "");
    }

    public boolean isConfigured() {
        return configured;
    }

    public void setConfigured(boolean configured) {
        this.configured = configured;
    }

    public void setTestNumbersEnabled(boolean testNumbersEnabled) {
        this.testNumbersEnabled = testNumbersEnabled;
    }

    /** The one gate every test-number bypass (here and in {@link com.example.demo.service.OtpService}) goes through. */
    public boolean isTestPhoneNumberBypassEnabled(String phone) {
        return testNumbersEnabled && isTestPhoneNumber(phone);
    }

    public static String toE164(String phone) {
        if (phone == null || phone.isBlank()) return "";
        String cleaned = phone.trim().replaceAll("[^0-9+]", "");
        if (cleaned.startsWith("+")) {
            return cleaned;
        }
        if (cleaned.length() == 10) {
            return "+1" + cleaned;
        }
        if (cleaned.length() == 11 && cleaned.startsWith("1")) {
            return "+" + cleaned;
        }
        return "+" + cleaned;
    }

    public static boolean isTestPhoneNumber(String phone) {
        if (phone == null || phone.isBlank()) return false;
        String clean = phone.replaceAll("\\D", "");
        return clean.startsWith("1555000") || clean.startsWith("555000");
    }

    /**
     * Initiates OTP delivery using Twilio Verify, or logs mock code in dev/test mode.
     */
    public boolean sendVerification(String phoneNumber) {
        if (phoneNumber == null || phoneNumber.isBlank()) {
            throw new BadRequestException("Phone number is required");
        }

        String e164 = toE164(phoneNumber);
        if (e164.length() < 10) {
            throw new BadRequestException("Please enter a valid, complete phone number.");
        }

        // Test accounts: always generate default bypass 000000 — only when explicitly enabled.
        if (isTestPhoneNumberBypassEnabled(phoneNumber)) {
            DevVerifyEntry entry = new DevVerifyEntry("000000", Instant.now().plusSeconds(900));
            devVerifyStore.put(e164, entry);
            devVerifyStore.put(phoneNumber.trim(), entry);
            log.info("[TWILIO VERIFY TEST ACCOUNT] Default mock code 000000 registered for phone_hash={}", RateLimitKeys.hash(e164));
            return true;
        }

        if (configured) {
            try {
                Verification verification = Verification.creator(verifyServiceSid, e164, "sms").create();
                log.info("Twilio Verify SMS initiated for phone_hash={} (sid: {}, status: {})",
                        RateLimitKeys.hash(e164), verification.getSid(), verification.getStatus());
                return true;
            } catch (ApiException e) {
                log.warn("Twilio Verify API error sending verification to phone_hash={}: {} (code: {}). Falling back to mock OTP.",
                        RateLimitKeys.hash(e164), e.getMessage(), e.getCode());
            } catch (Exception e) {
                log.warn("Unexpected error initiating Twilio Verify for phone_hash={}: {}. Falling back to mock OTP.",
                        RateLimitKeys.hash(e164), e.getMessage());
            }
        }

        // Mock / Dev fallback when Twilio Verify is unconfigured or returns error
        String mockCode = String.format("%06d", secureRandom.nextInt(1000000));
        DevVerifyEntry entry = new DevVerifyEntry(mockCode, Instant.now().plusSeconds(900));
        devVerifyStore.put(e164, entry);
        devVerifyStore.put(phoneNumber.trim(), entry);
        log.info("==================================================================");
        log.info("[TWILIO VERIFY MOCK OTP] Code generated for phone_hash [{}]: {}", RateLimitKeys.hash(e164), mockCode);
        log.info("==================================================================");
        return true;
    }

    /**
     * Checks verification code against Twilio Verify API, test bypasses, or dev mock store.
     */
    public boolean checkVerification(String phoneNumber, String code) {
        if (phoneNumber == null || phoneNumber.isBlank() || code == null || code.isBlank()) {
            return false;
        }

        String cleanCode = code.trim();
        String e164 = toE164(phoneNumber);

        // Instant approval for test accounts using the default code — only when explicitly enabled.
        if (isTestPhoneNumberBypassEnabled(phoneNumber) && "000000".equals(cleanCode)) {
            return true;
        }

        if (configured) {
            try {
                VerificationCheck check = VerificationCheck.creator(verifyServiceSid)
                        .setTo(e164)
                        .setCode(cleanCode)
                        .create();
                boolean approved = "approved".equalsIgnoreCase(check.getStatus());
                log.info("Twilio Verify check for phone_hash={}: status={}", RateLimitKeys.hash(e164), check.getStatus());
                if (approved) {
                    return true;
                }
            } catch (ApiException e) {
                log.warn("Twilio Verify API check error for phone_hash={}: {} (code: {}). Checking fallback store.",
                        RateLimitKeys.hash(e164), e.getMessage(), e.getCode());
            } catch (Exception e) {
                log.warn("Unexpected error during Twilio Verify check for phone_hash={}: {}. Checking fallback store.",
                        RateLimitKeys.hash(e164), e.getMessage());
            }
        }

        // Check dev mock store fallback
        DevVerifyEntry entry = devVerifyStore.get(e164);
        if (entry == null) {
            entry = devVerifyStore.get(phoneNumber.trim());
        }

        if (entry != null && entry.expiresAt().isAfter(Instant.now())) {
            if (entry.code().equals(cleanCode)) {
                devVerifyStore.remove(e164);
                devVerifyStore.remove(phoneNumber.trim());
                return true;
            }
        }

        return false;
    }

    public String getLatestMockCode(String phoneNumber) {
        if (phoneNumber == null) return null;
        String e164 = toE164(phoneNumber);
        DevVerifyEntry entry = devVerifyStore.get(e164);
        if (entry == null) {
            entry = devVerifyStore.get(phoneNumber.trim());
        }
        return entry != null ? entry.code() : null;
    }

    public void clearMockStore() {
        devVerifyStore.clear();
    }
}
