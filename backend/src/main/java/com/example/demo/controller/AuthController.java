package com.example.demo.controller;

import com.example.demo.dto.*;
import com.example.demo.exception.BadRequestException;
import com.example.demo.model.User;
import com.example.demo.ratelimit.RateLimitKeys;
import com.example.demo.repository.UserRepository;
import com.example.demo.service.AuthTokenService;
import com.example.demo.service.ContactService;
import com.example.demo.service.OtpService;
import com.example.demo.service.PlacementService;
import com.example.demo.service.ShareRequestService;
import com.example.demo.util.MinimumResponseTime;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);
    private static final String INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private final SecureRandom secureRandom = new SecureRandom();

    private final UserRepository userRepository;
    private final AuthTokenService authTokenService;
    private final PlacementService placementService;
    private final OtpService otpService;
    private final ContactService contactService;
    private final ShareRequestService shareRequestService;

    @Value("${app.invite.max-registrations-per-day:10}")
    private int maxInviteRegistrationsPerDay;

    @PostMapping("/signin/initiate-otp")
    public ResponseEntity<Void> initiateSignInOtp(@RequestBody InitiateOtpRequest request) {
        long startNanos = System.nanoTime();
        String phone = cleanPhone(request.phoneNumber());
        if (isBlank(phone)) {
            throw new BadRequestException("Phone number is required");
        }

        // S2: never reveal whether an account exists via a different response — always 200
        // with an identical empty body, and only actually send an SMS when eligible.
        if (userRepository.existsByPhoneNumber(phone)) {
            otpService.sendOtp(phone);
            log.info("Sent sign-in OTP to phone_hash={}", RateLimitKeys.hash(phone));
        }
        MinimumResponseTime.enforce(startNanos);
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

        log.info("User {} logged in via OTP", user.getId());
        String token = authTokenService.issueToken(user);
        return ResponseEntity.ok(new AuthResponse(token, UserResponse.from(user, true)));
    }

    @PostMapping("/signup/initiate-otp")
    public ResponseEntity<Void> initiateSignUpOtp(@RequestBody InitiateOtpRequest request) {
        long startNanos = System.nanoTime();
        String phone = cleanPhone(request.phoneNumber());
        if (isBlank(phone)) {
            throw new BadRequestException("Phone number is required");
        }

        // S2: always 200 with an identical empty body, whether the phone is already taken or
        // the invite code is invalid — only send an SMS when the number is actually eligible.
        boolean eligible = !userRepository.existsByPhoneNumber(phone);
        if (eligible && !isBlank(request.inviteCode())) {
            String code = request.inviteCode().trim().toUpperCase();
            eligible = userRepository.existsByInviteCode(code);
        }

        if (eligible) {
            otpService.sendOtp(phone);
            log.info("Sent sign-up OTP to phone_hash={}", RateLimitKeys.hash(phone));
        }
        MinimumResponseTime.enforce(startNanos);
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
        log.info("Sign-up OTP verified for phone_hash={}", RateLimitKeys.hash(phone));
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

            // S4: cap registrations per invite code per day (DB count over a rolling 24h window of
            // registered contacts created for this inviter — each invite-code registration
            // immediately creates exactly one, via connectMutually below; plan §4 P5 note: this
            // replaces the old `connections`-table count now that nothing writes that table any
            // more on invite registration).
            long recentInviteRegistrations = contactService.countRegisteredContactsCreatedSince(
                    inviter.getId(), Instant.now().minus(Duration.ofDays(1)));
            if (recentInviteRegistrations >= maxInviteRegistrationsPerDay) {
                throw new BadRequestException("This invite link has reached its limit for today");
            }
        }

        String uniqueInviteCode = generateUniqueInviteCode();
        // Plan §4 P5: the global map is gone — every new user just shares the one default
        // neighborhood (users.neighborhood_curve_index is NOT NULL until a later migration drops it).
        User user = User.builder()
                .firstName(firstName)
                .lastName(lastName)
                .phoneNumber(phone)
                .inviteCode(uniqueInviteCode)
                .createdAt(Instant.now())
                .neighborhood(placementService.defaultNeighborhood())
                .build();
        userRepository.save(user);

        if (inviter != null) {
            // Private-network mutual edge (plan §3): no placeholder to prefer on either side, so
            // both get a fresh REGISTERED contact for the other. This is now the only edge created
            // by invite-code registration — the old `connections` table is no longer written here.
            contactService.connectMutually(user, inviter, null);
            log.info("User {} auto-connected to inviter {}", user.getId(), inviter.getId());
        }

        // Deliver any share requests sent to this phone number before it had an account (plan §4 P3).
        shareRequestService.attachPendingRequestsForNewUser(user);

        // Clean up verified OTP record after successful registration
        otpService.clearOtp(phone);

        // Never log the invite code itself in the clear — hash it (same as rate-limit keys).
        log.info("Registered new user {} with invite code hash {}", user.getId(), RateLimitKeys.hash(uniqueInviteCode));
        String token = authTokenService.issueToken(user);
        return ResponseEntity.ok(new AuthResponse(token, UserResponse.from(user, true)));
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

    // S3: the bare POST /api/auth/initiate-otp endpoint (send an SMS to any number, no checks)
    // was removed — it wasn't called by the client and had none of S2's eligibility/enumeration
    // protections. POST /api/auth/verify-otp below is kept: the sign-in flow's verifySignInOtp
    // client call posts to it.

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

        String token = authTokenService.issueToken(user);
        return ResponseEntity.ok(new AuthResponse(token, UserResponse.from(user, true)));
    }

    // S2: pad the enumeration-sensitive initiate-otp responses to a constant floor (plus a
    // little jitter) so response timing can't be used to distinguish "existing/eligible number,
    // OTP dispatched" from "ineligible number, nothing sent" — MinimumResponseTime is shared with
    // ShareRequestService's create() for the same reason (plan §4 P4 fix-up).

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
        return com.example.demo.util.PhoneNumbers.clean(phone);
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
