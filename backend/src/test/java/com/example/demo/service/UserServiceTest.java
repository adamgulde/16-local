package com.example.demo.service;

import com.example.demo.dto.UserResponse;
import com.example.demo.model.User;
import com.example.demo.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * Plan §4 P5: there is no more global directory — {@link UserService#getPublicUserById} only ever
 * shows the caller their own phone number / inviteCode / discoverableInSharedGraphs (S4: an invite
 * code is only ever populated for its owner, never anyone looking them up by id).
 */
@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    private UserService userService;

    private final UUID selfId = UUID.randomUUID();
    private final User self = User.builder().id(selfId).firstName("Self").phoneNumber("+1 555-000-0001")
            .inviteCode("SELFCODE").discoverableInSharedGraphs(true).build();

    @BeforeEach
    void setUp() {
        userService = new UserService(userRepository);
    }

    @Test
    void ownProfileIncludesPhoneAndInviteCodeAndDiscoverability() {
        when(userRepository.findById(selfId)).thenReturn(Optional.of(self));

        UserResponse response = userService.getPublicUserById(selfId, selfId);

        assertThat(response.phoneNumber()).isEqualTo("+1 555-000-0001");
        assertThat(response.inviteCode()).isEqualTo("SELFCODE");
        assertThat(response.discoverableInSharedGraphs()).isTrue();
    }

    @Test
    void someoneElsesProfileNeverIncludesPhoneOrInviteCodeOrDiscoverability() {
        UUID viewerId = UUID.randomUUID();
        when(userRepository.findById(selfId)).thenReturn(Optional.of(self));

        UserResponse response = userService.getPublicUserById(selfId, viewerId);

        assertThat(response.phoneNumber()).isNull();
        assertThat(response.inviteCode()).isNull();
        assertThat(response.discoverableInSharedGraphs()).isNull();
        assertThat(response.firstName()).isEqualTo("Self");
    }
}
