package com.example.demo.controller;

import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.web.servlet.error.ErrorController;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Ensures that any requests routed to Spring Boot's /error endpoint (e.g. from
 * servlet container dispatches, security filter chain rejections, or unmapped routes)
 * return strictly masked, clean JSON payloads without leaking internal paths,
 * timestamps, or exception details.
 */
@RestController
public class CustomErrorController implements ErrorController {

    @RequestMapping("/error")
    public ResponseEntity<Map<String, String>> handleError(HttpServletRequest request) {
        Object status = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE);
        HttpStatus httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
        String errorMessage = "Internal server error";

        if (status != null) {
            try {
                int statusCode = Integer.parseInt(status.toString());
                httpStatus = HttpStatus.valueOf(statusCode);
                if (statusCode == 400) {
                    errorMessage = "Bad request";
                } else if (statusCode == 401) {
                    errorMessage = "Unauthorized";
                } else if (statusCode == 403) {
                    errorMessage = "Access denied";
                } else if (statusCode == 404) {
                    errorMessage = "Resource not found";
                } else if (statusCode == 405) {
                    errorMessage = "Method not allowed";
                }
            } catch (Exception ignored) {
                httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
            }
        }

        return ResponseEntity.status(httpStatus).body(Map.of("error", errorMessage));
    }
}
