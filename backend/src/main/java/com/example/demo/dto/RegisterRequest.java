package com.example.demo.dto;

public record RegisterRequest(
        String username,
        String password,
        String firstName,
        String lastName,
        String phoneNumber,
        String sponsorUsername
) {
}
