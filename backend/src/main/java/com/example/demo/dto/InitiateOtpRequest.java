package com.example.demo.dto;

public record InitiateOtpRequest(
        String phoneNumber,
        String inviteCode
) {
}
