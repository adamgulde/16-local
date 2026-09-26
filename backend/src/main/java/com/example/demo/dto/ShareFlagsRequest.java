package com.example.demo.dto;

/** PATCH /api/shares/{id} body — only non-null flags are applied (sharer only). */
public record ShareFlagsRequest(Boolean shareAbout, Boolean shareTags, Boolean shareNotes, Boolean sharePhone) {
}
