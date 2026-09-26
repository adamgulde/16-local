package com.example.demo.dto;

/**
 * One edge in a {@link Graph} — see plan §3. {@code source}/{@code target} are {@link GraphNode}
 * ids. {@code shareId} is non-null exactly when this edge was produced by graph composition through
 * a share (a SHARED attach edge, or a LINK/DIRECT edge reproduced from within a share's subgraph);
 * null means it's one of the caller's own edges.
 */
public record GraphEdge(String source, String target, EdgeKind kind, String shareId) {
}
