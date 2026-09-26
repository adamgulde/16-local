package com.example.demo.service;

import com.example.demo.model.User;
import com.example.demo.model.UserDeviceToken;
import com.example.demo.repository.UserDeviceTokenRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DeviceTokenServiceTest {

    @Mock
    private UserDeviceTokenRepository userDeviceTokenRepository;
    @Mock
    private UserService userService;

    private DeviceTokenService deviceTokenService;

    private final UUID userId = UUID.randomUUID();
    private final UUID otherUserId = UUID.randomUUID();

    @Test
    void registerDevice_savesNewToken() {
        deviceTokenService = new DeviceTokenService(userDeviceTokenRepository, userService);
        when(userDeviceTokenRepository.findByDeviceToken("token-123")).thenReturn(Optional.empty());
        when(userService.getUserById(userId)).thenReturn(User.builder().id(userId).build());

        deviceTokenService.registerDevice(userId, "token-123", "ios");

        ArgumentCaptor<UserDeviceToken> captor = ArgumentCaptor.forClass(UserDeviceToken.class);
        verify(userDeviceTokenRepository).save(captor.capture());
        assertThat(captor.getValue().getUser().getId()).isEqualTo(userId);
        assertThat(captor.getValue().getDeviceToken()).isEqualTo("token-123");
        assertThat(captor.getValue().getPlatform()).isEqualTo("ios");
    }

    @Test
    void registerDevice_reassignsExistingTokenToNewUser() {
        deviceTokenService = new DeviceTokenService(userDeviceTokenRepository, userService);
        Instant originalUpdatedAt = Instant.now().minusSeconds(3600);
        UserDeviceToken existing = UserDeviceToken.builder()
                .id(UUID.randomUUID())
                .user(User.builder().id(otherUserId).build())
                .deviceToken("token-123")
                .platform("android")
                .createdAt(originalUpdatedAt)
                .updatedAt(originalUpdatedAt)
                .build();
        when(userDeviceTokenRepository.findByDeviceToken("token-123")).thenReturn(Optional.of(existing));
        when(userService.getUserById(userId)).thenReturn(User.builder().id(userId).build());

        deviceTokenService.registerDevice(userId, "token-123", "ios");

        ArgumentCaptor<UserDeviceToken> captor = ArgumentCaptor.forClass(UserDeviceToken.class);
        verify(userDeviceTokenRepository).save(captor.capture());
        UserDeviceToken saved = captor.getValue();
        assertThat(saved.getId()).isEqualTo(existing.getId());
        assertThat(saved.getUser().getId()).isEqualTo(userId);
        assertThat(saved.getPlatform()).isEqualTo("ios");
    }

    @Test
    void unregisterDevice_deletesOnlyOwnedToken() {
        deviceTokenService = new DeviceTokenService(userDeviceTokenRepository, userService);

        deviceTokenService.unregisterDevice(userId, "token-123");

        verify(userDeviceTokenRepository).deleteByDeviceTokenAndUser_Id("token-123", userId);
    }
}
