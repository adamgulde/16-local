package com.example.demo.dto;

import java.util.UUID;

/** Non-null only on a node the caller sees through someone else's share — never on their own contacts. */
public record NodeSource(UUID shareId, UUID sharerUserId, String sharerName) {
}
