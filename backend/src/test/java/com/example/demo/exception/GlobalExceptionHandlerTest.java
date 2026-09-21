package com.example.demo.exception;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;

import java.util.Map;
import java.util.NoSuchElementException;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void handleUnexpected_returns500AndGenericMessage() {
        Exception ex = new RuntimeException("Database connection timeout at org.postgresql.Driver.connect");
        ResponseEntity<Map<String, String>> response = handler.handleUnexpected(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().get("error")).isEqualTo("Internal server error");
        // Ensure no stack trace or internal message leaked
        assertThat(response.getBody().get("error")).doesNotContain("postgresql");
    }

    @Test
    void handleIllegalArgument_masksInternalOrUuidMessages() {
        IllegalArgumentException ex = new IllegalArgumentException("Invalid UUID string: abc-123");
        ResponseEntity<Map<String, String>> response = handler.handleIllegalArgument(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().get("error")).isEqualTo("Invalid request parameter");
    }

    @Test
    void handleIllegalArgument_allowsKnownSafeBusinessMessage() {
        IllegalArgumentException ex = new IllegalArgumentException("A user cannot connect to themselves");
        ResponseEntity<Map<String, String>> response = handler.handleIllegalArgument(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().get("error")).isEqualTo("A user cannot connect to themselves");
    }

    @Test
    void handleNotFound_masksIds() {
        NotFoundException ex = new NotFoundException("User not found: 123e4567-e89b-12d3-a456-426614174000");
        ResponseEntity<Map<String, String>> response = handler.handleNotFound(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().get("error")).isEqualTo("User not found");
        assertThat(response.getBody().get("error")).doesNotContain("123e4567");
    }

    @Test
    void handleNoSuchElement_returnsCleanResourceNotFound() {
        NoSuchElementException ex = new NoSuchElementException();
        ResponseEntity<Map<String, String>> response = handler.handleNoSuchElement(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().get("error")).isEqualTo("Resource not found");
    }

    @Test
    void handleAccessDenied_returnsForbidden() {
        AccessDeniedException ex = new AccessDeniedException("Access denied");
        ResponseEntity<Map<String, String>> response = handler.handleAccessDenied(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().get("error")).isEqualTo("Access denied");
    }

    @Test
    void handleBadRequest_handlesNullMessageSafely() {
        BadRequestException ex = new BadRequestException(null);
        ResponseEntity<Map<String, String>> response = handler.handleBadRequest(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().get("error")).isEqualTo("Bad request");
    }
}
