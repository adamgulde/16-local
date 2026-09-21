package com.example.demo.service;

import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

@Service
public class SupabaseAuthService {

    @Value("${supabase.url:}")
    private String supabaseUrl;

    @Value("${supabase.service.key:}")
    private String serviceKey;

    private final WebClient webClient = WebClient.create();

    public void sendSmsOtp(String phoneNumber) {
        Map<String, Object> body = Map.of("phone", phoneNumber);

        webClient.post()
                .uri(supabaseUrl + "/auth/v1/otp")
                .header("apikey", serviceKey)
                .header("Authorization", "Bearer " + serviceKey)
                .bodyValue(body)
                .retrieve()
                .toBodilessEntity()
                .block(); // Simple synchronous block for prototype
    }

    public Map<String, Object> verifySmsOtp(String phoneNumber, String token) {
        Map<String, Object> body = Map.of(
                "phone", phoneNumber,
                "token", token,
                "type", "sms"
        );

        return webClient.post()
                .uri(supabaseUrl + "/auth/v1/verify")
                .header("apikey", serviceKey)
                .header("Authorization", "Bearer " + serviceKey)
                .bodyValue(body)
                .retrieve()
                .bodyToMono(Map.class)
                .block(); 
                // This returns the user details and access_token JWT from Supabase
    }
}
