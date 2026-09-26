package com.example.demo.controller;

import com.example.demo.dto.RegisterDeviceRequest;
import com.example.demo.dto.UnregisterDeviceRequest;
import com.example.demo.exception.BadRequestException;
import com.example.demo.service.DeviceTokenService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/devices")
@RequiredArgsConstructor
public class DeviceController {

    private static final int MAX_TOKEN_LENGTH = 4096;
    private static final Set<String> ALLOWED_PLATFORMS = Set.of("ios", "android");

    private final DeviceTokenService deviceTokenService;

    @PostMapping
    public ResponseEntity<Void> register(@RequestBody RegisterDeviceRequest request,
                                          @AuthenticationPrincipal UUID userId) {
        String token = normalizeToken(request.token());
        String platform = request.platform() == null ? "" : request.platform().trim().toLowerCase(Locale.ROOT);
        if (!ALLOWED_PLATFORMS.contains(platform)) {
            throw new BadRequestException("platform must be one of: ios, android");
        }

        deviceTokenService.registerDevice(userId, token, platform);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/unregister")
    public ResponseEntity<Void> unregister(@RequestBody UnregisterDeviceRequest request,
                                            @AuthenticationPrincipal UUID userId) {
        String token = normalizeToken(request.token());
        deviceTokenService.unregisterDevice(userId, token);
        return ResponseEntity.noContent().build();
    }

    private String normalizeToken(String rawToken) {
        String token = rawToken == null ? "" : rawToken.trim();
        if (token.isBlank()) {
            throw new BadRequestException("token must not be blank");
        }
        if (token.length() > MAX_TOKEN_LENGTH) {
            throw new BadRequestException("token exceeds maximum length");
        }
        return token;
    }
}
