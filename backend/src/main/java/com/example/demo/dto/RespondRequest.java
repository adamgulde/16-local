package com.example.demo.dto;

/** POST /api/share-requests/{id}/respond body — both false means decline. */
public record RespondRequest(boolean connect, boolean allowView) {
}
