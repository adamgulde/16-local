package com.example.demo.ratelimit;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Verifies application.properties keys (kebab-case) bind onto {@link RateLimitProperties} (S5). */
class RateLimitPropertiesBindingTest {

    @Test
    void bindsKebabCaseKeysOntoNestedGroups() {
        Map<String, Object> source = Map.ofEntries(
                Map.entry("app.rate-limit.ip.initiate-otp-per-hour", "7"),
                Map.entry("app.rate-limit.ip.initiate-otp-per-day", "21"),
                Map.entry("app.rate-limit.ip.verify-otp-per-window", "11"),
                Map.entry("app.rate-limit.ip.verify-otp-window-minutes", "16"),
                Map.entry("app.rate-limit.ip.register-per-hour", "6"),
                Map.entry("app.rate-limit.ip.validate-invite-per-hour", "31"),
                Map.entry("app.rate-limit.phone.otp-send-per-hour", "4"),
                Map.entry("app.rate-limit.phone.otp-send-per-day", "12"),
                Map.entry("app.rate-limit.user.requests-per-minute", "121"),
                Map.entry("app.rate-limit.trusted-proxy-cidrs", "10.0.0.0/8,192.168.0.0/16"),
                Map.entry("app.rate-limit.max-tracked-keys", "42")
        );

        Binder binder = new Binder(new MapConfigurationPropertySource(source));
        RateLimitProperties properties = binder.bind("app.rate-limit", RateLimitProperties.class).get();

        assertThat(properties.getIp().getInitiateOtpPerHour()).isEqualTo(7);
        assertThat(properties.getIp().getInitiateOtpPerDay()).isEqualTo(21);
        assertThat(properties.getIp().getVerifyOtpPerWindow()).isEqualTo(11);
        assertThat(properties.getIp().getVerifyOtpWindowMinutes()).isEqualTo(16);
        assertThat(properties.getIp().getRegisterPerHour()).isEqualTo(6);
        assertThat(properties.getIp().getValidateInvitePerHour()).isEqualTo(31);
        assertThat(properties.getPhone().getOtpSendPerHour()).isEqualTo(4);
        assertThat(properties.getPhone().getOtpSendPerDay()).isEqualTo(12);
        assertThat(properties.getUser().getRequestsPerMinute()).isEqualTo(121);
        assertThat(properties.getTrustedProxyCidrs()).containsExactly("10.0.0.0/8", "192.168.0.0/16");
        assertThat(properties.getMaxTrackedKeys()).isEqualTo(42L);
    }

    @Test
    void defaultsApplyWhenNothingConfigured() {
        RateLimitProperties properties = new RateLimitProperties();

        assertThat(properties.getIp().getInitiateOtpPerHour()).isEqualTo(5);
        assertThat(properties.getIp().getInitiateOtpPerDay()).isEqualTo(20);
        assertThat(properties.getIp().getVerifyOtpPerWindow()).isEqualTo(10);
        assertThat(properties.getIp().getVerifyOtpWindowMinutes()).isEqualTo(15);
        assertThat(properties.getIp().getRegisterPerHour()).isEqualTo(5);
        assertThat(properties.getIp().getValidateInvitePerHour()).isEqualTo(30);
        assertThat(properties.getPhone().getOtpSendPerHour()).isEqualTo(3);
        assertThat(properties.getPhone().getOtpSendPerDay()).isEqualTo(10);
        assertThat(properties.getUser().getRequestsPerMinute()).isEqualTo(120);
        assertThat(properties.getTrustedProxyCidrs()).containsExactly("127.0.0.0/8", "::1", "172.16.0.0/12");
        assertThat(properties.getMaxTrackedKeys()).isEqualTo(100_000L);
    }
}
