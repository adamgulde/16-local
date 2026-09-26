package com.example.demo.service.verify;

import com.example.demo.exception.BadRequestException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TwilioVerifyServiceTest {

    private TwilioVerifyService service;

    @BeforeEach
    void setUp() {
        // Unconfigured service runs in local mock mode
        service = new TwilioVerifyService();
        service.init();
    }

    @Test
    void toE164_formatsVariousInputsCorrectly() {
        assertThat(TwilioVerifyService.toE164("+1 555-123-4567")).isEqualTo("+15551234567");
        assertThat(TwilioVerifyService.toE164("(555) 123-4567")).isEqualTo("+15551234567");
        assertThat(TwilioVerifyService.toE164("5551234567")).isEqualTo("+15551234567");
        assertThat(TwilioVerifyService.toE164("15551234567")).isEqualTo("+15551234567");
        assertThat(TwilioVerifyService.toE164("+44 20 7123 4567")).isEqualTo("+442071234567");
        assertThat(TwilioVerifyService.toE164("")).isEqualTo("");
        assertThat(TwilioVerifyService.toE164(null)).isEqualTo("");
    }

    @Test
    void isTestPhoneNumber_identifiesDefaultTestAccounts() {
        assertThat(TwilioVerifyService.isTestPhoneNumber("+1 555-000-0001")).isTrue();
        assertThat(TwilioVerifyService.isTestPhoneNumber("+15550000002")).isTrue();
        assertThat(TwilioVerifyService.isTestPhoneNumber("5550000003")).isTrue();
        assertThat(TwilioVerifyService.isTestPhoneNumber("+1 555-123-4567")).isFalse();
        assertThat(TwilioVerifyService.isTestPhoneNumber(null)).isFalse();
    }

    @Test
    void sendVerification_missingOrInvalidPhone_throwsBadRequestException() {
        assertThatThrownBy(() -> service.sendVerification(""))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Phone number is required");

        assertThatThrownBy(() -> service.sendVerification("123"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Please enter a valid, complete phone number");
    }

    @Test
    void sendVerification_testAccount_setsDefaultMockCode_whenBypassEnabled() {
        service.setTestNumbersEnabled(true);
        String testPhone = "+1 555-000-0001";
        boolean sent = service.sendVerification(testPhone);

        assertThat(sent).isTrue();
        assertThat(service.getLatestMockCode(testPhone)).isEqualTo("000000");
        assertThat(service.checkVerification(testPhone, "000000")).isTrue();
    }

    @Test
    void sendVerification_testAccount_goesThroughTheNormalMockPathWhenBypassDisabled() {
        // Default (bypass disabled, as in production): a "555-000-xxxx" number is treated like
        // any other number — a random mock code, not the fixed 000000.
        String testPhone = "+1 555-000-0009";
        service.sendVerification(testPhone);

        assertThat(service.getLatestMockCode(testPhone)).isNotEqualTo("000000");
        assertThat(service.checkVerification(testPhone, "000000")).isFalse();
    }

    @Test
    void sendVerification_devMockFallback_generatesAndVerifiesCode() {
        String phone = "+1 555-123-4567";
        boolean sent = service.sendVerification(phone);

        assertThat(sent).isTrue();
        String code = service.getLatestMockCode(phone);
        assertThat(code).isNotNull();
        assertThat(code).hasSize(6);

        // Verification with correct mock code succeeds
        assertThat(service.checkVerification(phone, code)).isTrue();

        // One-time use: second attempt fails because code was consumed
        assertThat(service.checkVerification(phone, code)).isFalse();
    }

    @Test
    void checkVerification_invalidCode_returnsFalse() {
        String phone = "+1 555-123-4567";
        service.sendVerification(phone);

        assertThat(service.checkVerification(phone, "999999")).isFalse();
    }

    @Test
    void checkVerification_rejectsBypassCodeForRegularNumbers() {
        String phone = "+1 555-987-6543";
        assertThat(service.checkVerification(phone, "000000")).isFalse();
    }

    @Test
    void checkVerification_blankInputs_returnsFalse() {
        assertThat(service.checkVerification("", "123456")).isFalse();
        assertThat(service.checkVerification("+1 555-123-4567", "")).isFalse();
        assertThat(service.checkVerification(null, "123456")).isFalse();
        assertThat(service.checkVerification("+1 555-123-4567", null)).isFalse();
    }
}
