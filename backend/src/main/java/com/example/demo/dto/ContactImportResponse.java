package com.example.demo.dto;

import java.util.List;

/**
 * Result of a bulk import: the newly created placeholder nodes, plus how many entries were skipped
 * because they matched an existing contact (or an earlier entry in the same batch) or had no usable
 * name.
 */
public record ContactImportResponse(List<GraphNode> created, int skippedDuplicates, int skippedInvalid) {
}
