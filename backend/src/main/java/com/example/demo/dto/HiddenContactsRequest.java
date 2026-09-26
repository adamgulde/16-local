package com.example.demo.dto;

import java.util.List;
import java.util.UUID;

/** PUT /api/shares/{id}/hidden-contacts body — a full replace of the sharer's hidden set. */
public record HiddenContactsRequest(List<UUID> contactIds) {
}
