package com.example.demo.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Value("${app.cors.allowed-origins:http://localhost,http://localhost:80,http://localhost:5173}")
    private String allowedOrigins;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        List<String> rawOrigins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();

        List<String> patterns = new ArrayList<>(rawOrigins);
        List<String> devPatterns = List.of(
                "http://localhost",
                "http://localhost:*",
                "https://localhost",
                "https://localhost:*",
                "http://127.0.0.1",
                "http://127.0.0.1:*",
                "https://127.0.0.1",
                "https://127.0.0.1:*"
        );
        for (String devPattern : devPatterns) {
            if (!patterns.contains(devPattern)) {
                patterns.add(devPattern);
            }
        }

        registry.addMapping("/**")
                .allowedOriginPatterns(patterns.toArray(String[]::new))
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD")
                .allowedHeaders("*")
                .exposedHeaders("Authorization", "Content-Disposition")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
