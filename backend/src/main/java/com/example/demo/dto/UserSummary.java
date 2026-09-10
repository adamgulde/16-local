package com.example.demo.dto;

import com.example.demo.model.User;

import java.util.UUID;

/**
 * Just enough to show a name in a list (e.g. a connection-request row) — deliberately not a
 * {@link UserResponse}: a notification about who sent/received a request has no legitimate
 * reason to also carry that person's phone number or full relationship list.
 */
public record UserSummary(UUID id, String firstName, String lastName) {
    public static UserSummary from(User user) {
        return new UserSummary(user.getId(), user.getFirstName(), user.getLastName());
    }
}
