package com.example.demo.dto;

import java.util.UUID;

/**
 * Exactly one of tagId/customLabel should be set. A custom label is filed under parentTagId
 * (required for self-tags, optional for private tags) — TagService enforces which, and when.
 */
public record AddTagRequest(UUID tagId, String customLabel, UUID parentTagId) {
}
