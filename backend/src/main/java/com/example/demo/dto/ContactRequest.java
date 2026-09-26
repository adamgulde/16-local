package com.example.demo.dto;

/**
 * POST /api/contacts body (firstName required) and PATCH /api/contacts/{id} body (all optional —
 * only the fields present are applied; ContactService never clears a field a client omitted).
 */
public record ContactRequest(String firstName, String lastName, String about, String phoneNumber) {
}
