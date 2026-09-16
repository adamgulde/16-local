package com.example.demo.service;

import com.example.demo.model.Otp;
import com.example.demo.repository.OtpRepository;
import com.example.demo.service.sms.SmsService;
import com.example.demo.service.textbelt.TextbeltOtpService;
import com.example.demo.service.textbelt.TextbeltOtpService.TextbeltSendResult;
import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.Random;

@Slf4j
@Service
public class OtpService {

    private final OtpRepository otpRepository;
    private final TextbeltOtpService textbeltOtpService;
    private final SmsService smsService;
    private final Random random = new Random();

    @Getter
    @Setter
    @Value("${textbelt.enabled:false}")
    private boolean textbeltEnabled = false;

    public OtpService(OtpRepository otpRepository,
                      TextbeltOtpService textbeltOtpService,
                      @Autowired(required = false) SmsService smsService) {
        this.otpRepository = otpRepository;
        this.textbeltOtpService = textbeltOtpService;
        this.smsService = smsService;
    }

    public OtpService(OtpRepository otpRepository, TextbeltOtpService textbeltOtpService) {
        this(otpRepository, textbeltOtpService, null);
    }

    public void sendOtp(String phoneNumber) {
        String code = null;

        if (textbeltEnabled) {
            try {
                TextbeltSendResult result = textbeltOtpService.sendOtp(phoneNumber, phoneNumber);
                if (result != null && result.otp() != null) {
                    code = result.otp();
                }
            } catch (Exception e) {
                log.warn("Textbelt sendOtp failed, falling back to local OTP generation: {}", e.getMessage());
            }
        }

        if (code == null) {
            code = String.format("%06d", random.nextInt(1000000));
            log.info("==================================================================");
            log.info("[LOCAL OTP] Verification code for {}: {}", phoneNumber, code);
            log.info("==================================================================");
            if (smsService != null) {
                smsService.sendSms(phoneNumber, "Your verification code is: " + code);
            }
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

        // 1. Verify against Textbelt OTP API only if Textbelt is enabled
        if (textbeltEnabled) {
            try {
                boolean verified = textbeltOtpService.verifyOtp(phoneNumber, cleanCode);
                if (verified) {
                    return true;
                }
            } catch (Exception e) {
                log.warn("Textbelt verifyOtp error: {}", e.getMessage());
            }
        }

        // 2. Check local database record (supports local testing, dev mode, and direct match)
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
