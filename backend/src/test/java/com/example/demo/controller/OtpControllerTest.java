package com.example.demo.controller;

import com.example.demo.dto.OtpSendRequest;
import com.example.demo.dto.OtpVerifyRequest;
import com.example.demo.exception.GlobalExceptionHandler;
import com.example.demo.service.verify.TwilioVerifyService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class OtpControllerTest {

    private MockMvc mockMvc;

    @Mock
    private TwilioVerifyService twilioVerifyService;

    @InjectMocks
    private OtpController otpController;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(otpController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
                .build();
    }

    @Test
    void sendOtp_successful_returns200() throws Exception {
        when(twilioVerifyService.sendVerification("5551234567")).thenReturn(true);

        OtpSendRequest request = new OtpSendRequest("5551234567", "user123");

        mockMvc.perform(post("/api/otp/send")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Verification code sent."));
    }

    @Test
    void sendOtp_missingPhone_returns400() throws Exception {
        OtpSendRequest request = new OtpSendRequest("", "user123");

        mockMvc.perform(post("/api/otp/send")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void verifyOtp_validCode_returnsSuccessTrue() throws Exception {
        when(twilioVerifyService.checkVerification("5551234567", "123456")).thenReturn(true);

        OtpVerifyRequest request = new OtpVerifyRequest("5551234567", "123456");

        mockMvc.perform(post("/api/otp/verify")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.verified").value(true))
                .andExpect(jsonPath("$.message").value("Phone number successfully verified."));
    }

    @Test
    void verifyOtp_invalidCode_returnsSuccessFalse() throws Exception {
        when(twilioVerifyService.checkVerification("5551234567", "999999")).thenReturn(false);

        OtpVerifyRequest request = new OtpVerifyRequest("5551234567", "999999");

        mockMvc.perform(post("/api/otp/verify")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.verified").value(false))
                .andExpect(jsonPath("$.message").value("Invalid or expired code."));
    }
}
