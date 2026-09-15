package com.example.demo.dto;

public record OtpVerifyResponse(
        boolean success,
        boolean verified,
        String message
) {}
