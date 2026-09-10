package com.example.demo.service;

import com.example.demo.model.AuthToken;
import com.example.demo.model.User;
import com.example.demo.repository.AuthTokenRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Optional;

/** Issues and validates opaque bearer session tokens. */
@Service
@RequiredArgsConstructor
public class AuthTokenService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final AuthTokenRepository authTokenRepository;

    @Value("${app.auth.token-ttl-hours:168}")
    private long tokenTtlHours;

    @Transactional
    public String issueToken(User user) {
        authTokenRepository.deleteByUser(user);

        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        authTokenRepository.save(AuthToken.builder()
                .token(token)
                .user(user)
                .expiresAt(Instant.now().plus(tokenTtlHours, ChronoUnit.HOURS))
                .build());
        return token;
    }

    public Optional<User> resolveUser(String token) {
        return authTokenRepository.findByToken(token)
                .filter(t -> t.getExpiresAt().isAfter(Instant.now()))
                .map(AuthToken::getUser);
    }
}
