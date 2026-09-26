package com.example.demo.dto;

import java.util.List;

/** A linked user's own self-profile, as embedded in a {@link GraphNode} when visible to the viewer. */
public record ProfileView(String bio, List<TagAssignmentResponse> tags) {
}
