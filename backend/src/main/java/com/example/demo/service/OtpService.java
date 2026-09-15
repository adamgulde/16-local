package com.example.demo.service;

import com.example.demo.model.Otp;
import com.example.demo.repository.OtpRepository;
import com.example.demo.service.textbelt.TextbeltOtpService;
import com.example.demo.service.textbelt.TextbeltOtpService.TextbeltSendResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.Random;

@Slf4j
@Service
@RequiredArgsConstructor
public class OtpService {

    private final OtpRepository otpRepository;
    private final TextbeltOtpService textbeltOtpService;
    private final Random random = new Random();

    public void sendOtp(String phoneNumber) {
        TextbeltSendResult result = textbeltOtpService.sendOtp(phoneNumber, phoneNumber);

        String code = (result != null && result.otp() != null)
                ? result.otp()
                : String.format("%06d", random.nextInt(1000000));

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

        // 1. Verify against Textbelt OTP API
        boolean verified = textbeltOtpService.verifyOtp(phoneNumber, cleanCode);
        if (verified) {
            return true;
        }

        // 2. Check local database record (supports test mock / direct match)
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
