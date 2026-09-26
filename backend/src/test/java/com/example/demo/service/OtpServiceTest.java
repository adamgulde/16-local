package com.example.demo.service;

import com.example.demo.model.Otp;
import com.example.demo.ratelimit.RateLimitProperties;
import com.example.demo.ratelimit.RateLimitService;
import com.example.demo.repository.OtpRepository;
import com.example.demo.service.verify.TwilioVerifyService;
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
    private TwilioVerifyService twilioVerifyService;

    private OtpService otpService;

    @BeforeEach
    void setUp() {
        // Real (in-memory) rate limiter with default limits — plenty of headroom for these
        // tests, which each send/verify only a handful of times.
        otpService = new OtpService(otpRepository, twilioVerifyService,
                new RateLimitService(new RateLimitProperties()), new RateLimitProperties());
    }

    @Test
    void sendOtp_forRealUser_dispatchesToTwilioVerifyServiceAndSavesOtp() {
        String phone = "+12025550199";
        when(otpRepository.findByPhoneNumber(phone)).thenReturn(Optional.empty());
        when(twilioVerifyService.sendVerification(phone)).thenReturn(true);
        when(twilioVerifyService.getLatestMockCode(phone)).thenReturn("654321");

        otpService.sendOtp(phone);

        ArgumentCaptor<Otp> captor = ArgumentCaptor.forClass(Otp.class);
        verify(otpRepository).save(captor.capture());
        String savedCode = captor.getValue().getCode();
        assertThat(savedCode).isEqualTo("654321");
        assertThat(captor.getValue().getExpiresAt()).isAfter(LocalDateTime.now());

        verify(twilioVerifyService).sendVerification(eq(phone));
    }

    @Test
    void sendOtp_testAccount_setsDefault000000Code() {
        String phone = "+1 555-000-1234";
        when(otpRepository.findByPhoneNumber(phone)).thenReturn(Optional.empty());
        when(twilioVerifyService.sendVerification(phone)).thenReturn(true);
        when(twilioVerifyService.getLatestMockCode(phone)).thenReturn("000000");

        otpService.sendOtp(phone);

        ArgumentCaptor<Otp> captor = ArgumentCaptor.forClass(Otp.class);
        verify(otpRepository).save(captor.capture());
        assertThat(captor.getValue().getCode()).isEqualTo("000000");
    }

    @Test
    void sendOtp_afterPhoneBudgetExhausted_isASilentNoOp() {
        // S1: per-phone OTP send limit (default 3/hour, 10/day) — once exhausted, sendOtp must
        // not dispatch or persist anything, but also must not throw (S2 callers treat this as a
        // silent no-op so the phone's eligibility is never revealed via a different response).
        RateLimitProperties tightLimit = new RateLimitProperties();
        tightLimit.getPhone().setOtpSendPerHour(1);
        tightLimit.getPhone().setOtpSendPerDay(1);
        otpService = new OtpService(otpRepository, twilioVerifyService,
                new RateLimitService(tightLimit), tightLimit);

        String phone = "+12025550199";
        when(otpRepository.findByPhoneNumber(phone)).thenReturn(Optional.empty());
        when(twilioVerifyService.sendVerification(phone)).thenReturn(true);
        lenient().when(twilioVerifyService.getLatestMockCode(phone)).thenReturn("654321");

        otpService.sendOtp(phone); // consumes the only token
        verify(twilioVerifyService).isTestPhoneNumberBypassEnabled(phone);
        verify(twilioVerifyService).sendVerification(phone);
        verify(twilioVerifyService).getLatestMockCode(phone);
        verify(otpRepository).save(any());

        otpService.sendOtp(phone); // budget exhausted — no further dispatch or save
        verifyNoMoreInteractions(twilioVerifyService);
        verify(otpRepository, times(1)).save(any());
    }

    // --- Fix-up: the 555-000-xxxx test-number bypass must be off unless explicitly enabled -----

    @Test
    void verifyOtp_bypassCodeForTestNumber_isRejectedWhenBypassDisabled() {
        String phone = "+1 555-000-0001";
        when(twilioVerifyService.isTestPhoneNumberBypassEnabled(phone)).thenReturn(false);
        when(twilioVerifyService.checkVerification(phone, "000000")).thenReturn(false);
        when(otpRepository.findByPhoneNumber(phone)).thenReturn(Optional.empty());

        assertThat(otpService.verifyOtp(phone, "000000")).isFalse();
    }

    @Test
    void verifyOtp_bypassCodeForTestNumber_isAcceptedWhenBypassEnabled() {
        String phone = "+1 555-000-0001";
        when(twilioVerifyService.isTestPhoneNumberBypassEnabled(phone)).thenReturn(true);

        assertThat(otpService.verifyOtp(phone, "000000")).isTrue();
        verifyNoInteractions(otpRepository);
    }

    @Test
    void verifyOtp_whenCodeIsBlankOrNull_returnsFalse() {
        assertThat(otpService.verifyOtp("+12025550199", "")).isFalse();
        assertThat(otpService.verifyOtp("+12025550199", null)).isFalse();
        verifyNoInteractions(otpRepository);
    }

    @Test
    void verifyOtp_whenCodeMatchesViaTwilioVerify_returnsTrue() {
        String phone = "+12025550199";
        String code = "654321";

        when(twilioVerifyService.checkVerification(phone, code)).thenReturn(true);

        assertThat(otpService.verifyOtp(phone, code)).isTrue();
        verify(twilioVerifyService).checkVerification(phone, code);
    }

    @Test
    void verifyOtp_whenTwilioReturnsFalse_fallsBackToRepositoryAndReturnsTrue() {
        String phone = "+12025550199";
        String code = "654321";

        when(twilioVerifyService.checkVerification(phone, code)).thenReturn(false);

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
        when(twilioVerifyService.checkVerification(phone, "111111")).thenReturn(false);

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

        when(twilioVerifyService.checkVerification(phone, code)).thenReturn(false);

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
        when(twilioVerifyService.checkVerification(phone, "123456")).thenReturn(false);
        when(otpRepository.findByPhoneNumber(phone)).thenReturn(Optional.empty());

        assertThat(otpService.verifyOtp(phone, "123456")).isFalse();
    }

    @Test
    void verifySignUpOtp_whenValid_marksOtpAsVerified() {
        String phone = "+12025550199";
        String code = "123456";

        when(twilioVerifyService.checkVerification(phone, code)).thenReturn(true);
        when(otpRepository.findByPhoneNumber(phone)).thenReturn(Optional.empty());

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
        when(twilioVerifyService.checkVerification(phone, "999999")).thenReturn(false);
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
