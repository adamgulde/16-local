package com.example.demo.dto;

import java.util.UUID;

/** Exactly one of tagId/customLabel should be set — TagService enforces which, and when. */
public record AddTagRequest(UUID tagId, String customLabel) {
}
