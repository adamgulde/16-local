package com.example.demo.controller;

import com.example.demo.ratelimit.ClientIpResolver;
import com.example.demo.ratelimit.IpRateLimitFilter;
import com.example.demo.ratelimit.RateLimitConfig;
import com.example.demo.ratelimit.RateLimitService;
import com.example.demo.ratelimit.UserRateLimitFilter;
import com.example.demo.security.SecurityConfig;
import com.example.demo.security.TokenAuthenticationFilter;
import com.example.demo.service.AuthTokenService;
import com.example.demo.service.DeviceTokenService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * MockMvc slice test — no Testcontainers/database involved. Includes the real
 * SecurityConfig + TokenAuthenticationFilter so the 401 case is exercised for real.
 * Also pulls in the rate-limit (S1) filters SecurityConfig now wires into the chain, plus their
 * dependencies, since this slice test doesn't load the full application context.
 */
@WebMvcTest(controllers = DeviceController.class)
@Import({SecurityConfig.class, TokenAuthenticationFilter.class, RateLimitConfig.class,
        ClientIpResolver.class, RateLimitService.class, IpRateLimitFilter.class, UserRateLimitFilter.class})
class DeviceControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private DeviceTokenService deviceTokenService;

    @MockitoBean
    private AuthTokenService authTokenService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final String VALID_TOKEN = "a-valid-bearer-token";

    private void authenticateAs(UUID userId) {
        com.example.demo.model.User user = com.example.demo.model.User.builder().id(userId).build();
        when(authTokenService.resolveUser(VALID_TOKEN)).thenReturn(Optional.of(user));
    }

    @Test
    void register_withoutAuth_returns401() throws Exception {
        mockMvc.perform(post("/api/devices")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(Map.of("token", "abc", "platform", "ios"))))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(deviceTokenService);
    }

    @Test
    void register_blankToken_returns400() throws Exception {
        UUID userId = UUID.randomUUID();
        authenticateAs(userId);

        mockMvc.perform(post("/api/devices")
                        .header("Authorization", "Bearer " + VALID_TOKEN)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(Map.of("token", "  ", "platform", "ios"))))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(deviceTokenService);
    }

    @Test
    void register_unsupportedPlatform_returns400() throws Exception {
        UUID userId = UUID.randomUUID();
        authenticateAs(userId);

        mockMvc.perform(post("/api/devices")
                        .header("Authorization", "Bearer " + VALID_TOKEN)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(Map.of("token", "abc", "platform", "web"))))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(deviceTokenService);
    }

    @Test
    void register_valid_returns204() throws Exception {
        UUID userId = UUID.randomUUID();
        authenticateAs(userId);

        mockMvc.perform(post("/api/devices")
                        .header("Authorization", "Bearer " + VALID_TOKEN)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(Map.of("token", "abc", "platform", "IOS"))))
                .andExpect(status().isNoContent());

        verify(deviceTokenService).registerDevice(userId, "abc", "ios");
    }

    @Test
    void unregister_withoutAuth_returns401() throws Exception {
        mockMvc.perform(post("/api/devices/unregister")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(Map.of("token", "abc"))))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(deviceTokenService);
    }

    @Test
    void unregister_valid_returns204() throws Exception {
        UUID userId = UUID.randomUUID();
        authenticateAs(userId);

        mockMvc.perform(post("/api/devices/unregister")
                        .header("Authorization", "Bearer " + VALID_TOKEN)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(Map.of("token", "abc"))))
                .andExpect(status().isNoContent());

        verify(deviceTokenService).unregisterDevice(userId, "abc");
    }

    @Test
    void preflight_capacitorOrigin_isAllowed() throws Exception {
        mockMvc.perform(options("/api/devices")
                        .header("Origin", "capacitor://localhost")
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "authorization,content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "capacitor://localhost"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
    }

    @Test
    void preflight_androidWebViewOrigin_isAllowed() throws Exception {
        mockMvc.perform(options("/api/devices")
                        .header("Origin", "https://localhost")
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "authorization,content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://localhost"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
    }

    @Test
    void preflight_unrecognizedOrigin_isRejected() throws Exception {
        mockMvc.perform(options("/api/devices")
                        .header("Origin", "https://evil.example")
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "authorization,content-type"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test
    void register_fromCapacitorOrigin_authenticated_returns204WithAllowOriginEchoed() throws Exception {
        UUID userId = UUID.randomUUID();
        authenticateAs(userId);

        mockMvc.perform(post("/api/devices")
                        .header("Authorization", "Bearer " + VALID_TOKEN)
                        .header("Origin", "capacitor://localhost")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(Map.of("token", "abc", "platform", "ios"))))
                .andExpect(status().isNoContent())
                .andExpect(header().string("Access-Control-Allow-Origin", "capacitor://localhost"));

        verify(deviceTokenService).registerDevice(userId, "abc", "ios");
    }
}
