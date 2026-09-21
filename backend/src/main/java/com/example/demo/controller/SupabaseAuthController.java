package com.example.demo.controller;

import com.example.demo.service.SupabaseAuthService;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "http://localhost:3000") // Allow your React app
public class SupabaseAuthController {

    private final SupabaseAuthService authService;

    public SupabaseAuthController(SupabaseAuthService authService) {
        this.authService = authService;
    }

    // Endpoint 1: React calls this when user enters phone number and clicks "Send OTP"
    @PostMapping("/send-otp-supabase")
    public ResponseEntity<String> sendOtp(@RequestBody Map<String, String> request) {
        String phoneNumber = request.get("phone");
        authService.sendSmsOtp(phoneNumber);
        return ResponseEntity.ok("OTP sent successfully");
    }

    // Endpoint 2: React calls this when user types the 6-digit code and clicks "Login"
    @PostMapping("/verify-otp-supabase")
    public ResponseEntity<Map<String, Object>> verifyOtp(@RequestBody Map<String, String> request) {
        String phoneNumber = request.get("phone");
        String token = request.get("token");
        
        Map<String, Object> sessionData = authService.verifySmsOtp(phoneNumber, token);
        return ResponseEntity.ok(sessionData);
    }
}
