package com.example.demo.dto;

public record OtpVerifyRequest(
        String userId,
        String phone,
        String otp
) {
    public OtpVerifyRequest(String userId, String otp) {
        this(userId, null, otp);
    }
}
