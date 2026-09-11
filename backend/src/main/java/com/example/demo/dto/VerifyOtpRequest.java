package com.example.demo.dto;

public record VerifyOtpRequest(
        String phoneNumber,
        String code
) {
}
