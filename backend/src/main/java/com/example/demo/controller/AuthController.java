package com.example.demo.controller;

import com.example.demo.dto.AuthResponse;
import com.example.demo.dto.LoginRequest;
import com.example.demo.dto.RegisterRequest;
import com.example.demo.dto.UserResponse;
import com.example.demo.exception.BadRequestException;
import com.example.demo.model.ConnectionRequest;
import com.example.demo.model.User;
import com.example.demo.model.UserCredentials;
import com.example.demo.repository.ConnectionRequestRepository;
import com.example.demo.repository.UserCredentialsRepository;
import com.example.demo.repository.UserRepository;
import com.example.demo.service.AuthTokenService;
import com.example.demo.service.ConnectionService;
import com.example.demo.service.PlacementService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private final UserRepository userRepository;
    private final UserCredentialsRepository userCredentialsRepository;
    private final ConnectionRequestRepository connectionRequestRepository;
    private final AuthTokenService authTokenService;
    private final ConnectionService connectionService;
    private final PlacementService placementService;
    private final PasswordEncoder passwordEncoder;

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@RequestBody RegisterRequest request) {
        if (isBlank(request.username()) || isBlank(request.password())) {
            throw new BadRequestException("Username and password are required");
        }
        if (userCredentialsRepository.findByUsername(request.username()).isPresent()) {
            throw new BadRequestException("Username already exists");
        }

        User user = User.builder()
                .firstName(request.firstName())
                .lastName(request.lastName())
                .phoneNumber(request.phoneNumber())
                .build();

        User sponsor = null;
        if (isBlank(request.sponsorUsername())) {
            user = placementService.foundNeighborhood(user);
        } else {
            sponsor = userCredentialsRepository.findByUsername(request.sponsorUsername())
                    .map(UserCredentials::getUser)
                    .orElseThrow(() -> new BadRequestException("Sponsor not found"));
            user = placementService.joinNeighborhood(user, sponsor.getNeighborhood());
        }

        UserCredentials credentials = UserCredentials.builder()
                .username(request.username())
                .passwordHash(passwordEncoder.encode(request.password()))
                .user(user)
                .build();
        userCredentialsRepository.save(credentials);

        if (sponsor != null) {
            ConnectionRequest sponsorRequest = ConnectionRequest.builder()
                    .sender(user)
                    .receiver(sponsor)
                    .status(ConnectionRequest.RequestStatus.PENDING)
                    .isSponsorRequest(true)
                    .build();
            connectionRequestRepository.save(sponsorRequest);
        }

        log.info("Registered new user {} ({})", user.getId(), request.username());

        String token = authTokenService.issueToken(user);
        return ResponseEntity.ok(new AuthResponse(token, UserResponse.from(user, List.of(), true)));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@RequestBody LoginRequest request) {
        if (isBlank(request.username()) || isBlank(request.password())) {
            throw new BadRequestException("Username and password are required");
        }

        UserCredentials credentials = userCredentialsRepository.findByUsername(request.username())
                .orElseThrow(() -> new BadRequestException("Invalid username or password"));

        if (!passwordEncoder.matches(request.password(), credentials.getPasswordHash())) {
            log.warn("Failed login attempt for username {}", request.username());
            throw new BadRequestException("Invalid username or password");
        }

        User user = credentials.getUser();
        log.info("User {} logged in", user.getId());
        String token = authTokenService.issueToken(user);
        List<UUID> relationships = connectionService.getNeighborIds(user.getId());
        return ResponseEntity.ok(new AuthResponse(token, UserResponse.from(user, relationships, true)));
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
