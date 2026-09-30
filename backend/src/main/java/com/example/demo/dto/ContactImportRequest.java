package com.example.demo.dto;

import java.util.List;

/**
 * POST /api/contacts/import body — people the user picked from their phone's address book or an
 * uploaded vCard/CSV. Only what the user explicitly selected is ever sent; the address book itself
 * never leaves the device.
 */
public record ContactImportRequest(List<ContactRequest> contacts) {
}
