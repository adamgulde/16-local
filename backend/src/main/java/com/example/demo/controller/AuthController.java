package com.example.demo.controller;

import com.example.demo.dto.*;
import com.example.demo.exception.BadRequestException;
import com.example.demo.model.ConnectionRequest;
import com.example.demo.model.User;
import com.example.demo.repository.ConnectionRequestRepository;
import com.example.demo.repository.UserRepository;
import com.example.demo.service.AuthTokenService;
import com.example.demo.service.ConnectionService;
import com.example.demo.service.OtpService;
import com.example.demo.service.PlacementService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);
    private static final String INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private final SecureRandom secureRandom = new SecureRandom();

    private final UserRepository userRepository;
    private final ConnectionRequestRepository connectionRequestRepository;
    private final AuthTokenService authTokenService;
    private final ConnectionService connectionService;
    private final PlacementService placementService;
    private final OtpService otpService;

    @PostMapping("/signin/initiate-otp")
    public ResponseEntity<Void> initiateSignInOtp(@RequestBody InitiateOtpRequest request) {
        String phone = cleanPhone(request.phoneNumber());
        if (isBlank(phone)) {
            throw new BadRequestException("Phone number is required");
        }
        if (!userRepository.existsByPhoneNumber(phone)) {
            throw new BadRequestException("No account found with this phone number. Please sign up.");
        }
        otpService.sendOtp(phone);
        log.info("Sent sign-in OTP to {}", phone);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/signin/verify-otp")
    public ResponseEntity<AuthResponse> verifySignInOtp(@RequestBody VerifyOtpRequest request) {
        String phone = cleanPhone(request.phoneNumber());
        String code = clean(request.code());
        if (isBlank(phone) || isBlank(code)) {
            throw new BadRequestException("Phone number and verification code are required");
        }
        if (!otpService.verifyOtp(phone, code)) {
            throw new BadRequestException("Invalid or expired verification code");
        }

        User user = userRepository.findByPhoneNumber(phone)
                .orElseThrow(() -> new BadRequestException("User not found"));

        if (!user.isDefaultUser()) {
            List<ConnectionRequest> requests = connectionRequestRepository.findBySenderOrReceiver(user, user);
            if (requests.isEmpty()) {
                sendDefaultConnectionRequests(user);
            }
        }

        log.info("User {} logged in via OTP", user.getId());
        String token = authTokenService.issueToken(user);
        List<UUID> relationships = connectionService.getNeighborIds(user.getId());
        return ResponseEntity.ok(new AuthResponse(token, UserResponse.from(user, relationships, true)));
    }

    @PostMapping("/signup/initiate-otp")
    public ResponseEntity<Void> initiateSignUpOtp(@RequestBody InitiateOtpRequest request) {
        String phone = cleanPhone(request.phoneNumber());
        if (isBlank(phone)) {
            throw new BadRequestException("Phone number is required");
        }
        if (userRepository.existsByPhoneNumber(phone)) {
            throw new BadRequestException("An account with this phone number already exists. Please sign in.");
        }

        if (!isBlank(request.inviteCode())) {
            String code = request.inviteCode().trim().toUpperCase();
            if (!userRepository.existsByInviteCode(code)) {
                throw new BadRequestException("Invalid invite code");
            }
        }

        otpService.sendOtp(phone);
        log.info("Sent sign-up OTP to {}", phone);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/signup/verify-otp")
    public ResponseEntity<Void> verifySignUpOtp(@RequestBody VerifyOtpRequest request) {
        String phone = cleanPhone(request.phoneNumber());
        String code = clean(request.code());
        if (isBlank(phone) || isBlank(code)) {
            throw new BadRequestException("Phone number and verification code are required");
        }
        if (userRepository.existsByPhoneNumber(phone)) {
            throw new BadRequestException("An account with this phone number already exists. Please sign in.");
        }
        if (!otpService.verifySignUpOtp(phone, code)) {
            throw new BadRequestException("Invalid or expired verification code");
        }
        log.info("Sign-up OTP verified for phone {}", phone);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@RequestBody RegisterRequest request) {
        String phone = cleanPhone(request.phoneNumber());
        String code = clean(request.code());
        String firstName = clean(request.firstName());
        String lastName = clean(request.lastName());

        if (isBlank(phone) || isBlank(code) || isBlank(firstName) || isBlank(lastName)) {
            throw new BadRequestException("Phone number, verification code, first name, and last name are required");
        }

        if (userRepository.existsByPhoneNumber(phone)) {
            throw new BadRequestException("An account with this phone number already exists. Please sign in.");
        }

        if (!otpService.verifyRegistration(phone, code)) {
            throw new BadRequestException("Invalid or expired verification code");
        }

        User inviter = null;
        if (!isBlank(request.inviteCode())) {
            String inviteCode = request.inviteCode().trim().toUpperCase();
            inviter = userRepository.findByInviteCode(inviteCode)
                    .orElseThrow(() -> new BadRequestException("Invalid invite code"));
        }

        String uniqueInviteCode = generateUniqueInviteCode();
        User user = User.builder()
                .firstName(firstName)
                .lastName(lastName)
                .phoneNumber(phone)
                .inviteCode(uniqueInviteCode)
                .createdAt(Instant.now())
                .build();

        if (inviter != null) {
            user = placementService.joinNeighborhood(user, inviter.getNeighborhood());
            userRepository.save(user);
            connectionService.connect(user, inviter);
            log.info("User {} auto-connected to inviter {}", user.getId(), inviter.getId());
        } else {
            user = placementService.foundNeighborhood(user);
            userRepository.save(user);
        }

        // Clean up verified OTP record after successful registration
        otpService.clearOtp(phone);

        // For testing purposes: 3 existing default users send connection requests to the new user
        sendDefaultConnectionRequests(user);

        log.info("Registered new user {} with invite code {}", user.getId(), uniqueInviteCode);
        String token = authTokenService.issueToken(user);
        List<UUID> relationships = connectionService.getNeighborIds(user.getId());
        return ResponseEntity.ok(new AuthResponse(token, UserResponse.from(user, relationships, true)));
    }

    @GetMapping("/validate-invite")
    public ResponseEntity<InviteCodeValidationResponse> validateInvite(@RequestParam(required = false) String code) {
        if (isBlank(code)) {
            return ResponseEntity.ok(new InviteCodeValidationResponse(false, null));
        }
        return userRepository.findByInviteCode(code.trim().toUpperCase())
                .map(inviter -> ResponseEntity.ok(new InviteCodeValidationResponse(true, inviter.getFirstName() + " " + inviter.getLastName())))
                .orElseGet(() -> ResponseEntity.ok(new InviteCodeValidationResponse(false, null)));
    }

    @PostMapping("/initiate-otp")
    public ResponseEntity<Void> initiateOtp(@RequestBody(required = false) InitiateOtpRequest request,
                                             @RequestParam(required = false) String phoneNumber) {
        String phone = cleanPhone(request != null && request.phoneNumber() != null ? request.phoneNumber() : phoneNumber);
        if (isBlank(phone)) {
            throw new BadRequestException("Phone number is required");
        }
        otpService.sendOtp(phone);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/verify-otp")
    public ResponseEntity<AuthResponse> verifyOtp(@RequestBody(required = false) VerifyOtpRequest request,
                                                  @RequestParam(required = false) String phoneNumber,
                                                  @RequestParam(required = false) String code) {
        String phone = cleanPhone(request != null && request.phoneNumber() != null ? request.phoneNumber() : phoneNumber);
        String c = request != null && request.code() != null ? request.code() : code;
        if (isBlank(phone) || isBlank(c)) {
            throw new BadRequestException("Phone number and verification code are required");
        }
        if (!otpService.verifyOtp(phone, clean(c))) {
            throw new BadRequestException("Invalid or expired OTP");
        }

        User user = userRepository.findByPhoneNumber(phone)
                .orElseThrow(() -> new BadRequestException("User not found"));

        if (!user.isDefaultUser()) {
            List<ConnectionRequest> requests = connectionRequestRepository.findBySenderOrReceiver(user, user);
            if (requests.isEmpty()) {
                sendDefaultConnectionRequests(user);
            }
        }

        String token = authTokenService.issueToken(user);
        List<UUID> relationships = connectionService.getNeighborIds(user.getId());
        return ResponseEntity.ok(new AuthResponse(token, UserResponse.from(user, relationships, true)));
    }

    private void sendDefaultConnectionRequests(User newUser) {
        if (newUser.isDefaultUser()) {
            return;
        }

        List<UUID> connectedIds = connectionService.getNeighborIds(newUser.getId());
        Set<UUID> excludedUserIds = new HashSet<>(connectedIds);
        excludedUserIds.add(newUser.getId());

        List<ConnectionRequest> existingRequests = connectionRequestRepository.findBySenderOrReceiver(newUser, newUser);
        for (ConnectionRequest req : existingRequests) {
            if (req.getSender() != null) excludedUserIds.add(req.getSender().getId());
            if (req.getReceiver() != null) excludedUserIds.add(req.getReceiver().getId());
        }

        List<User> availableDefaults = userRepository.findAll().stream()
                .filter(u -> u.isDefaultUser() && !excludedUserIds.contains(u.getId()))
                .collect(Collectors.toList());

        if (availableDefaults.isEmpty()) {
            log.warn("No available default users found to send connection requests to new user {}", newUser.getId());
            return;
        }

        Collections.shuffle(availableDefaults, secureRandom);
        int count = Math.min(3, availableDefaults.size());
        for (int i = 0; i < count; i++) {
            User sender = availableDefaults.get(i);
            ConnectionRequest request = ConnectionRequest.builder()
                    .sender(sender)
                    .receiver(newUser)
                    .status(ConnectionRequest.RequestStatus.PENDING)
                    .build();
            connectionRequestRepository.save(request);
            log.info("Default user {} ({}) sent connection request to new user {}",
                    sender.getId(), sender.getFirstName() + " " + sender.getLastName(), newUser.getId());
        }
    }

    private String generateUniqueInviteCode() {
        for (int attempt = 0; attempt < 20; attempt++) {
            StringBuilder sb = new StringBuilder(6);
            for (int i = 0; i < 6; i++) {
                sb.append(INVITE_CHARS.charAt(secureRandom.nextInt(INVITE_CHARS.length())));
            }
            String code = sb.toString();
            if (!userRepository.existsByInviteCode(code)) {
                return code;
            }
        }
        return UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }

    private String clean(String s) {
        return s == null ? null : s.trim();
    }

    private String cleanPhone(String phone) {
        if (phone == null) return null;
        String trimmed = phone.trim();
        if (trimmed.isEmpty()) return null;

        // Support shortcuts like "0", "1", "100", "user 1", "user1", "User 100", "#1"
        String lower = trimmed.toLowerCase();
        if (lower.startsWith("user")) {
            lower = lower.substring(4).trim();
        } else if (lower.startsWith("#")) {
            lower = lower.substring(1).trim();
        } else if (lower.startsWith("+1")) {
            String rest = lower.substring(2).trim();
            if (rest.matches("\\d{1,3}")) {
                lower = rest;
            }
        }
        if (lower.matches("\\d{1,3}")) {
            int num = Integer.parseInt(lower);
            if (num >= 0 && num <= 105) {
                return String.format("+1 555-000-%04d", num);
            }
        }

        String digits = trimmed.replaceAll("\\D", "");
        if (digits.startsWith("1") && digits.length() == 11) {
            digits = digits.substring(1);
        }
        if (digits.length() == 10) {
            return String.format("+1 %s-%s-%s",
                    digits.substring(0, 3),
                    digits.substring(3, 6),
                    digits.substring(6));
        }
        return trimmed;
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
