package com.example.demo.dto;

import com.example.demo.model.Tag;

import java.util.UUID;

/** One entry in the global tag dictionary — the menu self-tagging (and tagging others) draws from. */
public record TagResponse(UUID id, String category, String label) {
    public static TagResponse from(Tag tag) {
        return new TagResponse(tag.getId(), tag.getCategory(), tag.getLabel());
    }
}
