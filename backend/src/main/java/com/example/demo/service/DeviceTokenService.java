package com.example.demo.service;

import com.example.demo.model.User;
import com.example.demo.model.UserDeviceToken;
import com.example.demo.repository.UserDeviceTokenRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/** Registers/unregisters push notification device tokens for the authenticated user. */
@Service
@RequiredArgsConstructor
public class DeviceTokenService {

    private final UserDeviceTokenRepository userDeviceTokenRepository;
    private final UserService userService;

    /**
     * Upsert on device token: a new token is saved for this user; an existing token is
     * reassigned to this user (the device switched accounts).
     */
    @Transactional
    public void registerDevice(UUID userId, String token, String platform) {
        UserDeviceToken deviceToken = userDeviceTokenRepository.findByDeviceToken(token)
                .orElseGet(UserDeviceToken::new);

        User user = userService.getUserById(userId);
        deviceToken.setUser(user);
        deviceToken.setDeviceToken(token);
        deviceToken.setPlatform(platform);
        userDeviceTokenRepository.save(deviceToken);
    }

    /** No-op if the token is unknown or owned by someone else — no enumeration. */
    @Transactional
    public void unregisterDevice(UUID userId, String token) {
        userDeviceTokenRepository.deleteByDeviceTokenAndUser_Id(token, userId);
    }
}
