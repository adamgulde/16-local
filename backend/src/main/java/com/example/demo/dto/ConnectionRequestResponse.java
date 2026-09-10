package com.example.demo.dto;

import com.example.demo.model.ConnectionRequest;

import java.util.UUID;

public record ConnectionRequestResponse(
        UUID id,
        UserSummary sender,
        UserSummary receiver,
        ConnectionRequest.RequestStatus status
) {
}
