package com.example.demo.controller;

import com.example.demo.dto.OtpActionResponse;
import com.example.demo.dto.OtpSendRequest;
import com.example.demo.dto.OtpVerifyRequest;
import com.example.demo.dto.OtpVerifyResponse;
import com.example.demo.exception.BadRequestException;
import com.example.demo.service.textbelt.TextbeltOtpService;
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

    private final TextbeltOtpService textbeltOtpService;

    @PostMapping("/send")
    public ResponseEntity<OtpActionResponse> sendOtp(
            @RequestBody OtpSendRequest request,
            @AuthenticationPrincipal UUID currentUserId,
            HttpServletRequest servletRequest) {

        if (request == null || request.phone() == null || request.phone().isBlank()) {
            throw new BadRequestException("Phone number is required");
        }

        String clientIp = extractClientIp(servletRequest);
        String resolvedUserId = (request.userId() != null && !request.userId().isBlank())
                ? request.userId().trim()
                : (currentUserId != null ? currentUserId.toString() : request.phone().trim());

        textbeltOtpService.sendOtp(request.phone(), resolvedUserId, null, null, null, clientIp);
        return ResponseEntity.ok(new OtpActionResponse(true, "Verification code sent."));
    }

    @PostMapping("/verify")
    public ResponseEntity<OtpVerifyResponse> verifyOtp(
            @RequestBody OtpVerifyRequest request,
            @AuthenticationPrincipal UUID currentUserId) {

        if (request == null || request.otp() == null || request.otp().isBlank()) {
            throw new BadRequestException("Verification code is required");
        }

        String resolvedUserId = (request.userId() != null && !request.userId().isBlank())
                ? request.userId().trim()
                : (request.phone() != null && !request.phone().isBlank()
                    ? request.phone().trim()
                    : (currentUserId != null ? currentUserId.toString() : null));

        if (resolvedUserId == null || resolvedUserId.isBlank()) {
            throw new BadRequestException("User or phone identifier is required for verification");
        }

        boolean verified = textbeltOtpService.verifyOtp(resolvedUserId, request.otp());
        if (verified) {
            return ResponseEntity.ok(new OtpVerifyResponse(true, true, "Phone number successfully verified."));
        } else {
            return ResponseEntity.ok(new OtpVerifyResponse(false, false, "Invalid or expired code."));
        }
    }

    private String extractClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            String[] parts = forwarded.split(",");
            return parts[0].trim();
        }
        return request.getRemoteAddr();
    }
}
