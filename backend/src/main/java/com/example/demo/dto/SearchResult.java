package com.example.demo.dto;

import java.util.List;

/**
 * One user-search hit: the matched user plus their direct connections,
 * both redacted for the requesting viewer just like any other UserResponse.
 */
public record SearchResult(UserResponse user, List<UserResponse> connections) {
}
