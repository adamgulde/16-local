package com.example.demo.dto;

public record OtpSendRequest(
        String phone,
        String userId
) {}
