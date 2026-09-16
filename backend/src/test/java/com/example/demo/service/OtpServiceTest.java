package com.example.demo.service;

import com.example.demo.model.Otp;
import com.example.demo.repository.OtpRepository;
import com.example.demo.service.textbelt.TextbeltOtpService;
import com.example.demo.service.textbelt.TextbeltOtpService.TextbeltSendResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OtpServiceTest {

    @Mock
    private OtpRepository otpRepository;

    @Mock
    private TextbeltOtpService textbeltOtpService;

    private OtpService otpService;

    @BeforeEach
    void setUp() {
        otpService = new OtpService(otpRepository, textbeltOtpService);
    }

    @Test
    void sendOtp_forRealUser_generatesCodeAndDispatchesToTextbeltService() {
        otpService.setTextbeltEnabled(true);
        String phone = "+12025550199";
        when(otpRepository.findByPhoneNumber(phone)).thenReturn(Optional.empty());
        when(textbeltOtpService.sendOtp(phone, phone))
                .thenReturn(new TextbeltSendResult(true, "txt-123", 50, null, "654321"));

        otpService.sendOtp(phone);

        ArgumentCaptor<Otp> captor = ArgumentCaptor.forClass(Otp.class);
        verify(otpRepository).save(captor.capture());
        String savedCode = captor.getValue().getCode();
        assertThat(savedCode).isEqualTo("654321");
        assertThat(captor.getValue().getExpiresAt()).isAfter(LocalDateTime.now());

        verify(textbeltOtpService).sendOtp(eq(phone), eq(phone));
    }

    @Test
    void sendOtp_whenTextbeltDisabled_generatesLocalCodeAndDoesNotCallTextbelt() {
        otpService.setTextbeltEnabled(false);
        String phone = "+12025550199";
        when(otpRepository.findByPhoneNumber(phone)).thenReturn(Optional.empty());

        otpService.sendOtp(phone);

        ArgumentCaptor<Otp> captor = ArgumentCaptor.forClass(Otp.class);
        verify(otpRepository).save(captor.capture());
        String savedCode = captor.getValue().getCode();
        assertThat(savedCode).matches("^\\d{6}$");
        assertThat(captor.getValue().getExpiresAt()).isAfter(LocalDateTime.now());

        verifyNoInteractions(textbeltOtpService);
    }

    @Test
    void verifyOtp_whenCodeIsBlankOrNull_returnsFalse() {
        assertThat(otpService.verifyOtp("+12025550199", "")).isFalse();
        assertThat(otpService.verifyOtp("+12025550199", null)).isFalse();
        verifyNoInteractions(otpRepository);
    }

    @Test
    void verifyOtp_whenCodeMatchesAndNotExpired_returnsTrue() {
        String phone = "+12025550199";
        String code = "654321";

        Otp localOtp = Otp.builder()
                .phoneNumber(phone)
                .code(code)
                .expiresAt(LocalDateTime.now().plusMinutes(10))
                .build();
        when(otpRepository.findByPhoneNumber(phone)).thenReturn(Optional.of(localOtp));

        assertThat(otpService.verifyOtp(phone, code)).isTrue();
    }

    @Test
    void verifyOtp_whenCodeDoesNotMatch_returnsFalse() {
        String phone = "+12025550199";
        Otp localOtp = Otp.builder()
                .phoneNumber(phone)
                .code("654321")
                .expiresAt(LocalDateTime.now().plusMinutes(10))
                .build();
        when(otpRepository.findByPhoneNumber(phone)).thenReturn(Optional.of(localOtp));

        assertThat(otpService.verifyOtp(phone, "111111")).isFalse();
    }

    @Test
    void verifyOtp_whenCodeExpiredInRepository_returnsFalse() {
        String phone = "+12025550199";
        String code = "654321";

        Otp expiredOtp = Otp.builder()
                .phoneNumber(phone)
                .code(code)
                .expiresAt(LocalDateTime.now().minusMinutes(1))
                .build();
        when(otpRepository.findByPhoneNumber(phone)).thenReturn(Optional.of(expiredOtp));

        assertThat(otpService.verifyOtp(phone, code)).isFalse();
    }

    @Test
    void verifyOtp_whenOtpNotFoundInRepository_returnsFalse() {
        String phone = "+12025550199";
        when(otpRepository.findByPhoneNumber(phone)).thenReturn(Optional.empty());

        assertThat(otpService.verifyOtp(phone, "123456")).isFalse();
    }

    @Test
    void verifySignUpOtp_whenValid_marksOtpAsVerified() {
        String phone = "+12025550199";
        String code = "123456";
        Otp localOtp = Otp.builder()
                .phoneNumber(phone)
                .code(code)
                .expiresAt(LocalDateTime.now().plusMinutes(10))
                .build();
        when(otpRepository.findByPhoneNumber(phone)).thenReturn(Optional.of(localOtp));

        boolean result = otpService.verifySignUpOtp(phone, code);
        assertThat(result).isTrue();

        ArgumentCaptor<Otp> captor = ArgumentCaptor.forClass(Otp.class);
        verify(otpRepository).save(captor.capture());
        assertThat(captor.getValue().getCode()).isEqualTo("VERIFIED");
        assertThat(captor.getValue().getExpiresAt()).isAfter(LocalDateTime.now());
    }

    @Test
    void verifySignUpOtp_whenInvalid_returnsFalse() {
        String phone = "+12025550199";
        when(otpRepository.findByPhoneNumber(phone)).thenReturn(Optional.empty());

        boolean result = otpService.verifySignUpOtp(phone, "999999");
        assertThat(result).isFalse();
        verify(otpRepository, never()).save(any());
    }

    @Test
    void verifyRegistration_whenPreVerified_returnsTrue() {
        String phone = "+12025550199";
        Otp verifiedOtp = Otp.builder()
                .phoneNumber(phone)
                .code("VERIFIED")
                .expiresAt(LocalDateTime.now().plusMinutes(10))
                .build();
        when(otpRepository.findByPhoneNumber(phone)).thenReturn(Optional.of(verifiedOtp));

        assertThat(otpService.verifyRegistration(phone, "any-code")).isTrue();
    }

    @Test
    void verifyRegistration_whenCodeMatchesDirectly_returnsTrue() {
        String phone = "+12025550199";
        String code = "123456";
        Otp otp = Otp.builder()
                .phoneNumber(phone)
                .code(code)
                .expiresAt(LocalDateTime.now().plusMinutes(10))
                .build();
        when(otpRepository.findByPhoneNumber(phone)).thenReturn(Optional.of(otp));

        assertThat(otpService.verifyRegistration(phone, code)).isTrue();
    }

    @Test
    void clearOtp_deletesOtpFromRepository() {
        String phone = "+12025550199";
        Otp otp = Otp.builder().phoneNumber(phone).code("VERIFIED").build();
        when(otpRepository.findByPhoneNumber(phone)).thenReturn(Optional.of(otp));

        otpService.clearOtp(phone);
        verify(otpRepository).delete(otp);
    }
}
