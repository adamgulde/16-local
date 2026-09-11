package com.example.demo.dto;

public record InviteCodeValidationResponse(
        boolean valid,
        String inviterName
) {
}
