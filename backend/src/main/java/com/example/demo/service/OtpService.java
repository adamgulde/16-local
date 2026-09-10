package com.example.demo.service;

import com.example.demo.model.Otp;
import com.example.demo.repository.OtpRepository;
import com.example.demo.service.sms.SmsService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Random;

@Service
@RequiredArgsConstructor
public class OtpService {

    private final OtpRepository otpRepository;
    private final SmsService smsService;
    private final Random random = new Random();

    public void sendOtp(String phoneNumber) {
        String code = String.format("%06d", random.nextInt(1000000));
        
        Otp otp = otpRepository.findByPhoneNumber(phoneNumber)
                .orElse(Otp.builder().phoneNumber(phoneNumber).build());
        
        otp.setCode(code);
        otp.setExpiresAt(LocalDateTime.now().plusMinutes(5));
        otpRepository.save(otp);
        
        smsService.sendSms(phoneNumber, "Your verification code is: " + code);
    }

    public boolean verifyOtp(String phoneNumber, String code) {
        return otpRepository.findByPhoneNumber(phoneNumber)
                .map(otp -> otp.getCode().equals(code) && otp.getExpiresAt().isAfter(LocalDateTime.now()))
                .orElse(false);
    }
}
