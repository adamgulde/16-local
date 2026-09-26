package com.example.demo.dto;

/** See plan §3's {@code Graph} contract. HIDDEN is only ever produced by graph composition (P4). */
public enum NodeKind {
    SELF, PLACEHOLDER, REGISTERED, HIDDEN
}
