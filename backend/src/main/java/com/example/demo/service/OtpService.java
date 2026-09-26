package com.example.demo.service;

import com.example.demo.model.Otp;
import com.example.demo.ratelimit.RateLimitKeys;
import com.example.demo.ratelimit.RateLimitProperties;
import com.example.demo.ratelimit.RateLimitService;
import com.example.demo.repository.OtpRepository;
import com.example.demo.service.verify.TwilioVerifyService;
import io.github.bucket4j.ConsumptionProbe;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Optional;

@Slf4j
@Service
public class OtpService {

    private final OtpRepository otpRepository;
    private final TwilioVerifyService twilioVerifyService;
    private final RateLimitService rateLimitService;
    private final RateLimitProperties rateLimitProperties;
    private final SecureRandom random = new SecureRandom();

    @Autowired
    public OtpService(OtpRepository otpRepository, TwilioVerifyService twilioVerifyService,
                       RateLimitService rateLimitService, RateLimitProperties rateLimitProperties) {
        this.otpRepository = otpRepository;
        this.twilioVerifyService = twilioVerifyService;
        this.rateLimitService = rateLimitService;
        this.rateLimitProperties = rateLimitProperties;
    }

    /**
     * Sends (or mocks) an OTP for {@code phoneNumber}, unless that phone number has hit its
     * send limit (S1: 3/hour, 10/day, keyed by a hash of the normalized phone number — never
     * the raw number). Callers in the enumeration-sensitive signin/signup flows (S2) must treat
     * a rate-limited send as a silent no-op, not a distinguishable error, so the phone's
     * existence/eligibility is never revealed via a different response.
     */
    public void sendOtp(String phoneNumber) {
        if (!tryConsumePhoneOtpSendBudget(phoneNumber)) {
            log.warn("OTP send rate limit exceeded for phone_hash={}", RateLimitKeys.hash(phoneNumber));
            return;
        }

        boolean isTest = twilioVerifyService.isTestPhoneNumberBypassEnabled(phoneNumber);
        String code = isTest ? "000000" : null;

        twilioVerifyService.sendVerification(phoneNumber);

        String mockCode = twilioVerifyService.getLatestMockCode(phoneNumber);
        if (mockCode != null) {
            code = mockCode;
        } else if (code == null) {
            code = String.format("%06d", random.nextInt(1000000));
        }

        Otp otp = otpRepository.findByPhoneNumber(phoneNumber)
                .orElse(Otp.builder().phoneNumber(phoneNumber).build());

        otp.setCode(code);
        otp.setExpiresAt(LocalDateTime.now().plusMinutes(15));
        otpRepository.save(otp);
    }

    public boolean verifyOtp(String phoneNumber, String code) {
        if (code == null || code.isBlank() || phoneNumber == null || phoneNumber.isBlank()) {
            return false;
        }

        String cleanCode = code.trim();

        // 1. Bypass for standard test code or test accounts — only when explicitly enabled
        // (app.otp.test-numbers-enabled); see TwilioVerifyService#isTestPhoneNumberBypassEnabled.
        if ("000000".equals(cleanCode) && twilioVerifyService.isTestPhoneNumberBypassEnabled(phoneNumber)) {
            return true;
        }

        // 2. Check Twilio Verify API / service
        boolean verified = twilioVerifyService.checkVerification(phoneNumber, cleanCode);
        if (verified) {
            return true;
        }

        // 3. Fallback to local database record
        return otpRepository.findByPhoneNumber(phoneNumber)
                .map(otp -> otp.getCode().equals(cleanCode)
                        && otp.getExpiresAt().isAfter(LocalDateTime.now()))
                .orElse(false);
    }

    /**
     * Verifies the code during the sign-up OTP step and marks the phone as pre-verified.
     */
    public boolean verifySignUpOtp(String phoneNumber, String code) {
        boolean verified = verifyOtp(phoneNumber, code);
        if (verified) {
            Otp otp = otpRepository.findByPhoneNumber(phoneNumber)
                    .orElse(Otp.builder().phoneNumber(phoneNumber).build());
            otp.setCode("VERIFIED");
            otp.setExpiresAt(LocalDateTime.now().plusMinutes(15));
            otpRepository.save(otp);
            return true;
        }
        return false;
    }

    /**
     * Validates whether a registration request is authorized via pre-verified OTP or direct code match.
     */
    public boolean verifyRegistration(String phoneNumber, String code) {
        Optional<Otp> existingOtp = otpRepository.findByPhoneNumber(phoneNumber);
        if (existingOtp.isPresent()) {
            Otp otp = existingOtp.get();
            if (otp.getExpiresAt().isAfter(LocalDateTime.now())) {
                if ("VERIFIED".equals(otp.getCode()) || (code != null && otp.getCode().equals(code.trim()))) {
                    return true;
                }
            }
        }

        return verifyOtp(phoneNumber, code);
    }

    /**
     * Clears any stored OTP entry after successful registration.
     */
    public void clearOtp(String phoneNumber) {
        otpRepository.findByPhoneNumber(phoneNumber).ifPresent(otpRepository::delete);
    }

    private boolean tryConsumePhoneOtpSendBudget(String phoneNumber) {
        String key = "phone-otp:" + RateLimitKeys.hash(phoneNumber);
        ConsumptionProbe probe = rateLimitService.tryConsume(key, () -> RateLimitService.bucketOf(
                RateLimitService.bandwidth(rateLimitProperties.getPhone().getOtpSendPerHour(), Duration.ofHours(1)),
                RateLimitService.bandwidth(rateLimitProperties.getPhone().getOtpSendPerDay(), Duration.ofDays(1))));
        return probe.isConsumed();
    }
}
