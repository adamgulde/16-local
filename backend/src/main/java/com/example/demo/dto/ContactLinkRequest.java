package com.example.demo.dto;

import java.util.UUID;

/** POST/DELETE /api/contacts/links body — both must be the caller's own contacts, a != b. */
public record ContactLinkRequest(UUID a, UUID b) {
}
