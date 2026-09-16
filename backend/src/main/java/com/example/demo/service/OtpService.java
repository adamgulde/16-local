package com.example.demo.service;

import com.example.demo.model.Otp;
import com.example.demo.repository.OtpRepository;
import com.example.demo.service.verify.TwilioVerifyService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Optional;

@Slf4j
@Service
public class OtpService {

    private final OtpRepository otpRepository;
    private final TwilioVerifyService twilioVerifyService;
    private final SecureRandom random = new SecureRandom();

    @Autowired
    public OtpService(OtpRepository otpRepository, TwilioVerifyService twilioVerifyService) {
        this.otpRepository = otpRepository;
        this.twilioVerifyService = twilioVerifyService;
    }

    public void sendOtp(String phoneNumber) {
        boolean isTest = TwilioVerifyService.isTestPhoneNumber(phoneNumber);
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

        // 1. Bypass for standard test code or test accounts
        if ("000000".equals(cleanCode) || TwilioVerifyService.isTestPhoneNumber(phoneNumber)) {
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
}
