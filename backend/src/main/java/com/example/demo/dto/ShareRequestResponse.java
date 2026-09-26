package com.example.demo.dto;

import com.example.demo.model.ShareRequest;

import java.time.Instant;
import java.util.UUID;

/**
 * Plan §3's {@code ShareRequest} DTO. {@code counterpartName} is always the sender's name for an
 * incoming request, but for an outgoing one it stays null until the request is ACCEPTED — outgoing
 * never echoes back what the sender typed (the phone number/invite code), and never reveals
 * whether it matched an account before that. {@code placeholderName}, outgoing only, is the name
 * of the sender's own placeholder contact they offered — that's the sender's own data, so showing
 * it while still PENDING reveals nothing about the recipient.
 */
public record ShareRequestResponse(
        UUID id,
        ShareRequestDirection direction,
        String counterpartName,
        String placeholderName,
        Instant createdAt,
        ShareRequest.Status status
) {
}
