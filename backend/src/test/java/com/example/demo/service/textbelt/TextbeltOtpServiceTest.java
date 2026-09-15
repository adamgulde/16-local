package com.example.demo.service.textbelt;

import com.example.demo.exception.BadRequestException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@SuppressWarnings("unchecked")
class TextbeltOtpServiceTest {

    @Mock
    private HttpClient httpClient;

    @Mock
    private HttpResponse<String> httpResponse;

    private OtpRateLimiter rateLimiter;
    private TextbeltOtpService service;

    @BeforeEach
    void setUp() {
        rateLimiter = new OtpRateLimiter();
        rateLimiter.setMaxRequests(5);
        rateLimiter.setWindowSeconds(600);
        service = new TextbeltOtpService(rateLimiter, new ObjectMapper(), httpClient);
        service.setApiKey("test_api_key");
        service.init();
    }

    @Test
    void sendOtp_successfulGeneration_returnsResult() throws Exception {
        String json = "{\"success\":true,\"textId\":\"txt-101\",\"quotaRemaining\":45,\"otp\":\"123456\"}";
        when(httpResponse.body()).thenReturn(json);
        doReturn(httpResponse).when(httpClient).send(any(HttpRequest.class), any());

        TextbeltOtpService.TextbeltSendResult result = service.sendOtp("5551234567", "user123");

        assertThat(result.success()).isTrue();
        assertThat(result.textId()).isEqualTo("txt-101");
        assertThat(result.quotaRemaining()).isEqualTo(45);

        ArgumentCaptor<HttpRequest> reqCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(reqCaptor.capture(), any());
        assertThat(reqCaptor.getValue().uri().toString()).isEqualTo(TextbeltOtpService.GENERATE_URL);
    }

    @Test
    void sendOtp_quotaExhaustedOrError_throwsBadRequestException() throws Exception {
        String json = "{\"success\":false,\"error\":\"Out of quota\",\"quotaRemaining\":0}";
        when(httpResponse.body()).thenReturn(json);
        doReturn(httpResponse).when(httpClient).send(any(HttpRequest.class), any());

        assertThatThrownBy(() -> service.sendOtp("5551234567", "user123"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Out of quota");
    }

    @Test
    void sendOtp_exampleOtpKey_freeTierDisabled_activatesDevMockFallback() throws Exception {
        service.setApiKey("example_otp_key");
        String json = "{\"success\":false,\"error\":\"Sorry, free SMS are disabled for this country due to abuse.\",\"otp\":\"\"}";
        when(httpResponse.body()).thenReturn(json);
        doReturn(httpResponse).when(httpClient).send(any(HttpRequest.class), any());

        TextbeltOtpService.TextbeltSendResult result = service.sendOtp("5551234567", "user123");

        assertThat(result.success()).isTrue();
        assertThat(result.otp()).isNotNull();
        assertThat(result.textId()).isEqualTo("mock-text-id");

        // Verifying the mock OTP code succeeds
        assertThat(service.verifyOtp("user123", result.otp())).isTrue();
    }

    @Test
    void sendOtp_networkTimeout_throwsSanitizedException() throws Exception {
        when(httpClient.send(any(HttpRequest.class), any()))
                .thenThrow(new HttpTimeoutException("Connection timed out"));

        assertThatThrownBy(() -> service.sendOtp("5551234567", "user123"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("temporarily unavailable");
    }

    @Test
    void sendOtp_whenRateLimitExceeded_throwsBadRequestException() throws Exception {
        rateLimiter.setMaxRequests(1);
        String json = "{\"success\":true,\"textId\":\"txt-101\",\"quotaRemaining\":45,\"otp\":\"123456\"}";
        when(httpResponse.body()).thenReturn(json);
        doReturn(httpResponse).when(httpClient).send(any(HttpRequest.class), any());

        service.sendOtp("5551234567", "user123", null, null, null, "192.168.1.1");

        assertThatThrownBy(() -> service.sendOtp("5551234567", "user123", null, null, null, "192.168.1.1"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Too many OTP requests");
    }

    @Test
    void verifyOtp_whenValid_returnsTrue() throws Exception {
        String json = "{\"success\":true,\"isValidOtp\":true}";
        when(httpResponse.body()).thenReturn(json);
        doReturn(httpResponse).when(httpClient).send(any(HttpRequest.class), any());

        boolean valid = service.verifyOtp("user123", "123 456");

        assertThat(valid).isTrue();
        ArgumentCaptor<HttpRequest> reqCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(reqCaptor.capture(), any());
        assertThat(reqCaptor.getValue().uri().toString()).contains("otp=123456");
        assertThat(reqCaptor.getValue().uri().toString()).contains("userid=user123");
    }

    @Test
    void verifyOtp_whenInvalid_returnsFalse() throws Exception {
        String json = "{\"success\":true,\"isValidOtp\":false}";
        when(httpResponse.body()).thenReturn(json);
        doReturn(httpResponse).when(httpClient).send(any(HttpRequest.class), any());

        boolean valid = service.verifyOtp("user123", "999999");

        assertThat(valid).isFalse();
    }

    @Test
    void verifyOtp_whenNetworkError_returnsFalseGracefully() throws Exception {
        when(httpClient.send(any(HttpRequest.class), any()))
                .thenThrow(new IOException("Connection reset"));

        boolean valid = service.verifyOtp("user123", "123456");

        assertThat(valid).isFalse();
    }

    @Test
    void verifyOtp_whenInputIsBlankOrNull_returnsFalseWithoutCallingHttp() {
        assertThat(service.verifyOtp(null, "123456")).isFalse();
        assertThat(service.verifyOtp("user123", null)).isFalse();
        assertThat(service.verifyOtp("user123", "   ")).isFalse();

        verifyNoInteractions(httpClient);
    }

    @Test
    void formatPhone_formatsUsAndInternationalNumbers() {
        assertThat(service.formatPhone("+1 (555) 123-4567")).isEqualTo("5551234567");
        assertThat(service.formatPhone("+15551234567")).isEqualTo("5551234567");
        assertThat(service.formatPhone("555-123-4567")).isEqualTo("5551234567");
        assertThat(service.formatPhone("+44 7712 345678")).isEqualTo("+447712345678");
    }

    @Test
    void normalizeUserId_normalizesPhoneNumbersPreservingUsernames() {
        assertThat(service.normalizeUserId("+1 (555) 123-4567")).isEqualTo("5551234567");
        assertThat(service.normalizeUserId("555-123-4567")).isEqualTo("5551234567");
        assertThat(service.normalizeUserId("user@example.com")).isEqualTo("user@example.com");
        assertThat(service.normalizeUserId("c8d7e6f5-1234-5678-9abc-def012345678")).isEqualTo("c8d7e6f5-1234-5678-9abc-def012345678");
        assertThat(service.normalizeUserId("user_alpha")).isEqualTo("user_alpha");
    }
}
