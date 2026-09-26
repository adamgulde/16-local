package com.example.demo.dto;

/** See plan §3's {@code GraphEdge} contract. */
public enum EdgeKind {
    /** SELF (or, in a share's own graph, the sharer) to one of their own contacts. */
    DIRECT,
    /** Between two of the same owner's contacts ({@code contact_links}). */
    LINK,
    /** A share overlay attaching the sharer's node to one of the sharer's own contacts. */
    SHARED
}
