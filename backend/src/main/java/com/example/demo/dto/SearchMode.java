package com.example.demo.dto;

/** Which field the user search looks at — one at a time, chosen by the search bar's mode toggle. */
public enum SearchMode {
    NAMES,
    /** Tag criteria (tree nodes and/or free-text labels), combined with AND or OR. */
    TAGS,
    /** Public bios. */
    BIOS,
    /** The viewer's own private notes about people — never anyone else's. */
    NOTES
}
