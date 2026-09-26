package com.example.demo.dto;

import java.util.List;

/** See plan §3 — the whole response shape for {@code GET /api/graph} and {@code GET /api/shares/{id}/graph}. */
public record Graph(List<GraphNode> nodes, List<GraphEdge> edges) {
}
