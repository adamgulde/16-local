package com.example.demo.service.textbelt;

import com.example.demo.exception.BadRequestException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Service for sending and verifying phone OTPs using the Textbelt OTP API
 * (https://docs.textbelt.com/otp-mobile-verification).
 */
@Slf4j
@Service
public class TextbeltOtpService {

    public static final String GENERATE_URL = "https://textbelt.com/otp/generate";
    public static final String VERIFY_URL = "https://textbelt.com/otp/verify";

    @Getter
    @Setter
    @Value("${textbelt.api-key:example_otp_key}")
    private String apiKey = "example_otp_key";

    @Getter
    @Setter
    @Value("${textbelt.otp-lifetime:180}")
    private int defaultLifetime = 180;

    @Getter
    @Setter
    @Value("${textbelt.otp-length:6}")
    private int defaultLength = 6;

    @Getter
    @Setter
    @Value("${textbelt.enabled:false}")
    private boolean enabled = false;

    @Getter
    @Setter
    @Value("${textbelt.otp-message:Your verification code is $OTP. Valid for 3 minutes.}")
    private String defaultMessage = "Your verification code is $OTP. Valid for 3 minutes.";

    private final OtpRateLimiter rateLimiter;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    // Dev fallback store when example_otp_key runs out of Textbelt's 1-per-day test quota
    private final ConcurrentHashMap<String, DevOtpEntry> devOtpStore = new ConcurrentHashMap<>();

    private record DevOtpEntry(String code, Instant expiresAt) {}

    @org.springframework.beans.factory.annotation.Autowired
    public TextbeltOtpService(OtpRateLimiter rateLimiter) {
        this(rateLimiter, new ObjectMapper(), HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build());
    }

    TextbeltOtpService(OtpRateLimiter rateLimiter, ObjectMapper objectMapper, HttpClient httpClient) {
        this.rateLimiter = rateLimiter;
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
    }

    @PostConstruct
    public void init() {
        if (apiKey != null) {
            apiKey = apiKey.trim().replace("\"", "").replace("'", "");
        }
        log.info("TextbeltOtpService initialized (key: {}, defaultLifetime: {}s, defaultLength: {})",
                "example_otp_key".equalsIgnoreCase(apiKey) ? "example_otp_key [DEV]" : "[CONFIGURED]",
                defaultLifetime,
                defaultLength);
    }

    /**
     * Send an OTP code to a phone number for the given userId.
     */
    public TextbeltSendResult sendOtp(String phone, String userId) {
        return sendOtp(phone, userId, null, null, null, null);
    }

    /**
     * Send an OTP code with custom options and client IP for rate limiting.
     */
    public TextbeltSendResult sendOtp(String phone, String userId, Integer lifetime, Integer length, String customMessage, String clientIp) {
        String formattedPhone = formatPhone(phone);
        if (formattedPhone == null || formattedPhone.isBlank()) {
            throw new BadRequestException("A valid phone number is required.");
        }

        String rawUserId = (userId != null && !userId.isBlank()) ? userId.trim() : formattedPhone;
        String resolvedUserId = normalizeUserId(rawUserId);

        // Rate limiting check
        rateLimiter.checkRateLimit(clientIp, resolvedUserId);

        int resolvedLifetime = (lifetime != null && lifetime > 0) ? lifetime : defaultLifetime;
        int resolvedLength = (length != null && length > 0) ? length : defaultLength;
        String resolvedMessage = (customMessage != null && !customMessage.isBlank()) ? customMessage : defaultMessage;
        if (resolvedMessage == null || !resolvedMessage.contains("$OTP")) {
            resolvedMessage = "Your verification code is $OTP. Valid for 3 minutes.";
        }

        // Local testing or example key: generate mock OTP without making external network calls
        if (!enabled || "example_otp_key".equalsIgnoreCase(apiKey)) {
            String devCode = generateDevCode(resolvedLength);
            devOtpStore.put(resolvedUserId.toLowerCase(), new DevOtpEntry(devCode, Instant.now().plusSeconds(resolvedLifetime)));
            String formattedUserKey = formatPhone(resolvedUserId);
            if (formattedUserKey != null) {
                devOtpStore.put(formattedUserKey.toLowerCase(), new DevOtpEntry(devCode, Instant.now().plusSeconds(resolvedLifetime)));
            }
            log.info("==================================================================");
            log.info("[TEXTBELT LOCAL/DEV MOCK OTP] Code generated for user [{}]: {}", resolvedUserId, devCode);
            log.info("==================================================================");
            return new TextbeltSendResult(true, "mock-text-id", 0, null, devCode);
        }

        Map<String, Object> requestPayload = new HashMap<>();
        requestPayload.put("phone", formattedPhone);
        requestPayload.put("userid", resolvedUserId);
        requestPayload.put("key", apiKey);
        requestPayload.put("lifetime", resolvedLifetime);
        requestPayload.put("length", resolvedLength);
        requestPayload.put("message", resolvedMessage);

        try {
            String jsonBody = objectMapper.writeValueAsString(requestPayload);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(GENERATE_URL))
                    .timeout(Duration.ofSeconds(15))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            JsonNode root = objectMapper.readTree(response.body());

            boolean success = root.path("success").asBoolean(false);
            int quotaRemaining = root.path("quotaRemaining").asInt(-1);
            String textId = root.path("textId").asText(null);
            String error = root.path("error").asText(null);
            String otpCode = root.path("otp").asText(null);

            // Log status without ever logging plaintext OTP
            if (success) {
                log.info("Textbelt OTP generated successfully for user [{}] (quotaRemaining: {})",
                        maskUserId(resolvedUserId), quotaRemaining);
                return new TextbeltSendResult(true, textId, quotaRemaining, null, otpCode);
            }

            log.warn("Textbelt OTP generate returned failure for user [{}]: status={}, body={}",
                    maskUserId(resolvedUserId), response.statusCode(), response.body());

            // Developer fallback for example_otp_key when free texts are disabled or test quota is exhausted
            if ("example_otp_key".equalsIgnoreCase(apiKey)) {
                log.warn("Textbelt free-tier response ({}) for example_otp_key. Activating dev mock fallback for user [{}]",
                        error != null ? error : "free tier limited",
                        maskUserId(resolvedUserId));
                String devCode = generateDevCode(resolvedLength);
                devOtpStore.put(resolvedUserId.toLowerCase(), new DevOtpEntry(devCode, Instant.now().plusSeconds(resolvedLifetime)));
                String formattedUserKey = formatPhone(resolvedUserId);
                if (formattedUserKey != null) {
                    devOtpStore.put(formattedUserKey.toLowerCase(), new DevOtpEntry(devCode, Instant.now().plusSeconds(resolvedLifetime)));
                }
                log.info("==================================================================");
                log.info("[TEXTBELT DEV MOCK OTP] Code generated for user [{}]: {}", resolvedUserId, devCode);
                log.info("==================================================================");
                return new TextbeltSendResult(true, "mock-text-id", 0, null, devCode);
            }

            if (quotaRemaining == 0) {
                log.error("Textbelt quota exhausted! Quota remaining: 0");
            }

            throw new BadRequestException("Failed to send verification code: " + (error != null ? error : "Provider error"));

        } catch (BadRequestException e) {
            throw e;
        } catch (Exception e) {
            log.error("Network or parsing error calling Textbelt generate endpoint: {}", e.getMessage(), e);
            throw new BadRequestException("Verification service is temporarily unavailable. Please try again later.");
        }
    }

    /**
     * Verify an OTP submitted by the user against the Textbelt verification endpoint.
     */
    public boolean verifyOtp(String userId, String otp) {
        if (userId == null || userId.isBlank() || otp == null || otp.isBlank()) {
            return false;
        }

        String cleanOtp = otp.trim().replaceAll("\\D", "");
        if (cleanOtp.isEmpty()) {
            return false;
        }

        String cleanUserId = normalizeUserId(userId.trim());

        // Check dev mock fallback if active
        if (checkDevOtp(cleanUserId, cleanOtp)) {
            return true;
        }

        try {
            String query = String.format("?otp=%s&userid=%s&key=%s",
                    URLEncoder.encode(cleanOtp, StandardCharsets.UTF_8),
                    URLEncoder.encode(cleanUserId, StandardCharsets.UTF_8),
                    URLEncoder.encode(apiKey, StandardCharsets.UTF_8));

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(VERIFY_URL + query))
                    .timeout(Duration.ofSeconds(15))
                    .header("Accept", "application/json")
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            JsonNode root = objectMapper.readTree(response.body());

            boolean success = root.path("success").asBoolean(false);
            boolean isValidOtp = root.path("isValidOtp").asBoolean(false);

            if (success && isValidOtp) {
                log.info("Textbelt OTP verified successfully for user [{}]", maskUserId(cleanUserId));
                return true;
            } else {
                log.info("Textbelt OTP verification failed for user [{}] (isValidOtp: {})",
                        maskUserId(cleanUserId), isValidOtp);
                return false;
            }

        } catch (Exception e) {
            log.error("Error communicating with Textbelt verify endpoint: {}", e.getMessage(), e);
            return false;
        }
    }

    public String formatPhone(String phone) {
        if (phone == null) return null;
        String trimmed = phone.trim();
        if (trimmed.isEmpty()) return null;

        String digits = trimmed.replaceAll("\\D", "");
        if (digits.isEmpty()) return null;

        // US 11-digit with leading country code 1: format to E.164 -> +1<10 digits>
        if (digits.length() == 11 && digits.startsWith("1")) {
            return "+" + digits;
        }

        // US standard 10-digit format: format to E.164 -> +1<10 digits>
        if (digits.length() == 10) {
            return "+1" + digits;
        }

        // International format with leading +
        if (trimmed.startsWith("+")) {
            return "+" + digits;
        }

        return "+" + digits;
    }

    public String normalizeUserId(String userId) {
        if (userId == null) return null;
        String trimmed = userId.trim();
        if (trimmed.isEmpty()) return trimmed;

        if (isPhoneLike(trimmed)) {
            String formatted = formatPhone(trimmed);
            return (formatted != null && !formatted.isBlank()) ? formatted : trimmed;
        }
        return trimmed;
    }

    private boolean isPhoneLike(String s) {
        if (s == null || s.isBlank()) return false;
        if (s.contains("@") || s.matches(".*[a-zA-Z].*")) {
            return false;
        }
        String digits = s.replaceAll("\\D", "");
        return digits.length() >= 7 && digits.length() <= 15 && s.matches("^[+]?[0-9\\s()\\-.]+$");
    }

    private boolean checkDevOtp(String userId, String code) {
        String key1 = userId.toLowerCase().trim();
        String key2 = formatPhone(userId);
        DevOtpEntry entry = devOtpStore.get(key1);
        if (entry == null && key2 != null) {
            entry = devOtpStore.get(key2.toLowerCase());
        }
        if (entry != null) {
            if (Instant.now().isBefore(entry.expiresAt()) && entry.code().equals(code)) {
                devOtpStore.remove(key1);
                if (key2 != null) devOtpStore.remove(key2.toLowerCase());
                return true;
            }
        }
        return false;
    }

    private String generateDevCode(int length) {
        StringBuilder sb = new StringBuilder();
        java.util.concurrent.ThreadLocalRandom random = java.util.concurrent.ThreadLocalRandom.current();
        for (int i = 0; i < length; i++) {
            sb.append(random.nextInt(10));
        }
        return sb.toString();
    }

    private String maskUserId(String userId) {
        if (userId == null || userId.length() <= 4) return "***";
        return userId.substring(0, 2) + "***" + userId.substring(userId.length() - 2);
    }

    public record TextbeltSendResult(
            boolean success,
            String textId,
            Integer quotaRemaining,
            String error,
            String otp
    ) {}
}
