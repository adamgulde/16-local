package com.example.demo.controller;

import com.example.demo.dto.Graph;
import com.example.demo.service.GraphService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/** Plan §3, §4 P4 — the caller's own private graph: SELF, their contacts, and SHARED overlays. */
@RestController
@RequiredArgsConstructor
public class GraphController {

    private final GraphService graphService;

    @GetMapping("/api/graph")
    public Graph graph(@AuthenticationPrincipal UUID viewerId) {
        return graphService.buildFor(viewerId);
    }
}
