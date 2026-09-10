package com.example.demo.dto;

/** How much of the rest of the network is reachable from a user within a given hop count. */
public record ReachResponse(int reachableCount, long totalUsers, double percentage) {
}
