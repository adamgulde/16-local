package com.example.demo.dto;

public record RegisterRequest(
        String phoneNumber,
        String code,
        String firstName,
        String lastName,
        String inviteCode
) {
}
