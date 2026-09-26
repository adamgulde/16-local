package com.example.demo.dto;

import java.util.UUID;

/**
 * POST /api/share-requests body — exactly one of {@code phoneNumber}/{@code inviteCode} must be
 * set. {@code placeholderContactId}, if given, must be the sender's own unlinked contact (§4 P3);
 * the response is always 202 regardless of whether either identifier matched an account.
 */
public record ShareRequestCreateRequest(String phoneNumber, String inviteCode, UUID placeholderContactId) {
}
