package com.example.demo.controller;

import com.example.demo.dto.ReachResponse;
import com.example.demo.dto.SearchResult;
import com.example.demo.dto.UserResponse;
import com.example.demo.exception.BadRequestException;
import com.example.demo.model.User;
import com.example.demo.service.ConnectionService;
import com.example.demo.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final ConnectionService connectionService;

    @GetMapping
    public List<UserResponse> getAllUsers(@AuthenticationPrincipal UUID requestingUserId) {
        return userService.getAllUsers(requestingUserId);
    }

    @GetMapping("/search")
    public List<SearchResult> searchUsers(
            @RequestParam String q,
            @RequestParam(required = false, defaultValue = "true") boolean searchNames,
            @RequestParam(required = false, defaultValue = "true") boolean searchTags,
            @AuthenticationPrincipal UUID requestingUserId) {
        return userService.searchUsers(q, searchNames, searchTags, requestingUserId);
    }

    @GetMapping("/{id}")
    public UserResponse getUserById(@PathVariable UUID id, @AuthenticationPrincipal UUID requestingUserId) {
        return userService.getPublicUserById(id, requestingUserId);
    }

    @PutMapping("/{id}")
    public UserResponse updateUser(@PathVariable UUID id, @RequestBody User user,
                                    @AuthenticationPrincipal UUID requestingUserId) {
        if (!id.equals(requestingUserId)) {
            throw new BadRequestException("You can only update your own profile");
        }
        User updated = userService.updateUser(id, user);
        return userService.getPublicUserById(updated.getId(), requestingUserId);
    }

    /** A user's public bio — visible to everyone, editable only by themselves. */
    @PutMapping("/{id}/bio")
    public ResponseEntity<Void> updateBio(@PathVariable UUID id, @RequestBody Map<String, String> body,
                                           @AuthenticationPrincipal UUID requestingUserId) {
        if (!id.equals(requestingUserId)) {
            throw new BadRequestException("You can only update your own bio");
        }
        userService.updateBio(id, body.getOrDefault("bio", ""));
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    public void deleteUser(@PathVariable UUID id, @AuthenticationPrincipal UUID requestingUserId) {
        if (!id.equals(requestingUserId)) {
            throw new BadRequestException("You can only delete your own account");
        }
        userService.deleteUser(id);
    }

    @DeleteMapping("/{id}/connection")
    public ResponseEntity<Void> disconnect(@PathVariable UUID id, @AuthenticationPrincipal UUID requestingUserId) {
        if (id.equals(requestingUserId)) {
            throw new BadRequestException("Cannot disconnect from yourself");
        }
        connectionService.disconnect(requestingUserId, id);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/me/auto-reject")
    public ResponseEntity<Void> updateAutoReject(@RequestBody Map<String, Integer> body,
                                                  @AuthenticationPrincipal UUID requestingUserId) {
        Integer maxDegree = body.get("maxConnectionDegree");
        userService.updateMaxConnectionDegree(requestingUserId, maxDegree);
        return ResponseEntity.noContent().build();
    }

    /**
     * Just the ordered hop ids — the frontend only ever needs identity to draw the path, not
     * full profiles. Returning {@link UserResponse}s here used to leak a hop's real phone
     * number whenever the requester happened to already be directly connected to them (the
     * same visibility rule every other endpoint correctly applies) — a "find the path between
     * two people" feature has no legitimate reason to be a vehicle for that, so it doesn't get
     * to see it at all now.
     */
    @GetMapping("/{id}/path/{targetId}")
    public List<UUID> getShortestPath(@PathVariable UUID id, @PathVariable UUID targetId) {
        return connectionService.findShortestPath(id, targetId);
    }

    /** % of the rest of the network reachable from user {id} within {degree} hops of the connection graph. */
    @GetMapping("/{id}/reach")
    public ReachResponse getReach(@PathVariable UUID id, @RequestParam int degree) {
        if (degree < 1 || degree > 10) {
            throw new BadRequestException("degree must be between 1 and 10");
        }
        int reachable = connectionService.countReachableWithinDegree(id, degree);
        long totalUsers = userService.countUsers();
        long others = Math.max(totalUsers - 1, 0);
        double percentage = others == 0 ? 0.0 : (reachable * 100.0) / others;
        return new ReachResponse(reachable, totalUsers, percentage);
    }
}
