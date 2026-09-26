package com.example.demo.controller;

import com.example.demo.dto.UserResponse;
import com.example.demo.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Plan §4 P5 (+ fix-up): the global directory/search/reach/friends/connection endpoints are gone
 * — a private graph (contacts + shares) replaces them. Everything left here is self-scoped only:
 * {@code GET/PUT /api/users/{id}} and {@code PUT /api/users/{id}/bio} were removed too — no
 * legitimate caller without a directory (a user id otherwise only ever surfaces as someone else's
 * {@code linkedUserId}/{@code sharerUserId}, neither of which should be a lookup key), and
 * {@code PUT /{id}} let a caller silently overwrite their own phone number with no OTP
 * re-verification, which under this model lets them hijack another number's pending share requests.
 */
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    /** Self profile, incl. inviteCode and discoverableInSharedGraphs — never populated for anyone else. */
    @GetMapping("/me")
    public UserResponse getMe(@AuthenticationPrincipal UUID requestingUserId) {
        return userService.getPublicUserById(requestingUserId, requestingUserId);
    }

    /**
     * SELF-node edits: firstName/lastName/bio only. Contact edits (§3) never touch this endpoint,
     * and neither does the phone number — changing that requires re-proving ownership via OTP
     * (the signup/register flow), not a bare field edit; a stray {@code phoneNumber} in the body
     * is silently ignored, never applied.
     */
    @PatchMapping("/me")
    public UserResponse patchMe(@RequestBody Map<String, String> body, @AuthenticationPrincipal UUID requestingUserId) {
        userService.updateSelfProfile(requestingUserId, body.get("firstName"), body.get("lastName"), body.get("bio"));
        return userService.getPublicUserById(requestingUserId, requestingUserId);
    }

    /** Plan §1.5: whether this user's registered contacts of others may show them by name in a shared graph. */
    @PutMapping("/me/privacy")
    public ResponseEntity<Void> updatePrivacy(@RequestBody Map<String, Boolean> body,
                                               @AuthenticationPrincipal UUID requestingUserId) {
        boolean discoverable = Boolean.TRUE.equals(body.get("discoverableInSharedGraphs"));
        userService.updateDiscoverableInSharedGraphs(requestingUserId, discoverable);
        return ResponseEntity.noContent().build();
    }

    /**
     * Self-deletion only — there is no {@code DELETE /{id}} any more (deleting an arbitrary id was
     * never actually reachable for anyone but the caller themselves, since it 400'd otherwise; this
     * is that same behavior made structural). Cascades: the caller's own contacts/links/tags/shares
     * go with them; a REGISTERED contact *other* people hold for the caller becomes a PLACEHOLDER
     * (linked_user_id -> NULL, ON DELETE SET NULL) rather than disappearing — see
     * {@code UserDeletionIT}.
     */
    @DeleteMapping("/me")
    public void deleteSelf(@AuthenticationPrincipal UUID requestingUserId) {
        userService.deleteUser(requestingUserId);
    }
}
