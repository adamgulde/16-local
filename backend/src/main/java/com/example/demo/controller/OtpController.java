package com.example.demo.controller;

import com.example.demo.dto.OtpActionResponse;
import com.example.demo.dto.OtpSendRequest;
import com.example.demo.dto.OtpVerifyRequest;
import com.example.demo.dto.OtpVerifyResponse;
import com.example.demo.exception.BadRequestException;
import com.example.demo.service.verify.TwilioVerifyService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/otp")
@RequiredArgsConstructor
public class OtpController {

    private final TwilioVerifyService twilioVerifyService;

    @PostMapping("/send")
    public ResponseEntity<OtpActionResponse> sendOtp(
            @RequestBody OtpSendRequest request,
            @AuthenticationPrincipal UUID currentUserId,
            HttpServletRequest servletRequest) {

        if (request == null || request.phone() == null || request.phone().isBlank()) {
            throw new BadRequestException("Phone number is required");
        }

        boolean sent = twilioVerifyService.sendVerification(request.phone());
        if (!sent) {
            throw new BadRequestException("Failed to send verification code. Please try again.");
        }
        return ResponseEntity.ok(new OtpActionResponse(true, "Verification code sent."));
    }

    @PostMapping("/verify")
    public ResponseEntity<OtpVerifyResponse> verifyOtp(
            @RequestBody OtpVerifyRequest request,
            @AuthenticationPrincipal UUID currentUserId) {

        if (request == null || request.otp() == null || request.otp().isBlank()) {
            throw new BadRequestException("Verification code is required");
        }

        String phone = (request.phone() != null && !request.phone().isBlank())
                ? request.phone().trim()
                : (request.userId() != null && !request.userId().isBlank() ? request.userId().trim() : null);

        if (phone == null || phone.isBlank()) {
            throw new BadRequestException("Phone number is required for verification");
        }

        boolean verified = twilioVerifyService.checkVerification(phone, request.otp().trim());
        if (verified) {
            return ResponseEntity.ok(new OtpVerifyResponse(true, true, "Phone number successfully verified."));
        } else {
            return ResponseEntity.ok(new OtpVerifyResponse(false, false, "Invalid or expired code."));
        }
    }
}
