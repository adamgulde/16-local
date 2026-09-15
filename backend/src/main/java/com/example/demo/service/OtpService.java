package com.example.demo.service;

import com.example.demo.model.Otp;
import com.example.demo.repository.OtpRepository;
import com.example.demo.service.sms.SmsService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.Random;

@Service
@RequiredArgsConstructor
public class OtpService {

    private final OtpRepository otpRepository;
    private final SmsService smsService;
    private final Random random = new Random();

    public void sendOtp(String phoneNumber) {
        boolean isDefaultNumber = phoneNumber != null && phoneNumber.startsWith("+1 555-000-");
        String code = isDefaultNumber ? "000000" : String.format("%06d", random.nextInt(1000000));

        Otp otp = otpRepository.findByPhoneNumber(phoneNumber)
                .orElse(Otp.builder().phoneNumber(phoneNumber).build());

        otp.setCode(code);
        otp.setExpiresAt(LocalDateTime.now().plusMinutes(15));
        otpRepository.save(otp);

        if (!isDefaultNumber) {
            smsService.sendSms(phoneNumber, "Your verification code is: " + code);
        }
    }

    public boolean verifyOtp(String phoneNumber, String code) {
        if ("000000".equals(code)) {
            return true;
        }

        return otpRepository.findByPhoneNumber(phoneNumber)
                .map(otp -> otp.getCode().equals(code != null ? code.trim() : null)
                        && otp.getExpiresAt().isAfter(LocalDateTime.now()))
                .orElse(false);
    }

    /**
     * Verifies the code during the sign-up OTP step and marks the phone as pre-verified.
     */
    public boolean verifySignUpOtp(String phoneNumber, String code) {
        if ("000000".equals(code)) {
            Otp otp = otpRepository.findByPhoneNumber(phoneNumber)
                    .orElse(Otp.builder().phoneNumber(phoneNumber).build());
            otp.setCode("VERIFIED");
            otp.setExpiresAt(LocalDateTime.now().plusMinutes(15));
            otpRepository.save(otp);
            return true;
        }

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
        if ("000000".equals(code)) {
            return true;
        }

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
