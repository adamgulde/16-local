package com.example.demo.service.sms;

import com.example.demo.security.EncryptedPhoneNumberConverter;
import com.twilio.Twilio;
import com.twilio.exception.ApiException;
import com.twilio.rest.api.v2010.account.Message;
import com.twilio.type.PhoneNumber;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Twilio SMS messaging service using regular Twilio Programmable Messaging,
 * with fallback to mock/console logging in dev/test environments.
 */
@Service
public class TwilioSmsService implements SmsService {

    private static final Logger log = LoggerFactory.getLogger(TwilioSmsService.class);

    @Value("${twilio.account-sid:}")
    private String accountSid;

    @Value("${twilio.auth-token:}")
    private String authToken;

    @Value("${twilio.phone-number:}")
    private String twilioPhoneNumber;

    @Value("${twilio.messaging-service-sid:}")
    private String messagingServiceSid;

    private boolean configured = false;

    @PostConstruct
    public void init() {
        if (accountSid != null) accountSid = sanitize(accountSid);
        if (authToken != null) authToken = sanitize(authToken);
        if (twilioPhoneNumber != null) twilioPhoneNumber = sanitize(twilioPhoneNumber);
        if (messagingServiceSid != null) messagingServiceSid = sanitize(messagingServiceSid);

        if (accountSid != null && !accountSid.isBlank() && authToken != null && !authToken.isBlank()) {
            try {
                Twilio.init(accountSid, authToken);
                configured = true;
                if (isSmsConfigured()) {
                    log.info("Twilio SMS messaging initialized (Sender: {})",
                            messagingServiceSid != null && !messagingServiceSid.isBlank() ? messagingServiceSid : twilioPhoneNumber);
                } else {
                    log.warn("Twilio credentials configured, but neither phone-number nor messaging-service-sid is set.");
                }
            } catch (Exception e) {
                log.error("Failed to initialize Twilio SDK: {}", e.getMessage());
            }
        } else {
            log.warn("Twilio credentials not configured; SMS messages will be logged to console in dev/test mode");
        }
    }

    private String sanitize(String value) {
        return value.trim().replace("\"", "").replace("'", "");
    }

    public boolean isConfigured() {
        return configured;
    }

    public boolean isSmsConfigured() {
        return configured && ((twilioPhoneNumber != null && !twilioPhoneNumber.isBlank())
                || (messagingServiceSid != null && !messagingServiceSid.isBlank()));
    }

    private String toE164(String phone) {
        if (phone == null) return "";
        String cleaned = phone.trim().replaceAll("[^0-9+]", "");
        if (cleaned.startsWith("+")) return cleaned;
        if (cleaned.length() == 10) return "+1" + cleaned;
        if (cleaned.length() == 11 && cleaned.startsWith("1")) return "+" + cleaned;
        return "+" + cleaned;
    }

    @Override
    public void sendSms(String phoneNumber, String message) {
        if (isSmsConfigured()) {
            try {
                String to = toE164(phoneNumber);
                if (messagingServiceSid != null && !messagingServiceSid.isBlank()) {
                    Message.creator(
                            new PhoneNumber(to),
                            messagingServiceSid,
                            message
                    ).create();
                } else {
                    String from = toE164(twilioPhoneNumber);
                    Message.creator(
                            new PhoneNumber(to),
                            new PhoneNumber(from),
                            message
                    ).create();
                }
                log.info("Twilio SMS successfully sent to {}", EncryptedPhoneNumberConverter.encrypt(to));
                return;
            } catch (ApiException e) {
                log.warn("Twilio API error sending SMS to {}: {} (code: {}). Falling back to console log.",
                        EncryptedPhoneNumberConverter.encrypt(phoneNumber), e.getMessage(), e.getCode());
            } catch (Exception e) {
                log.warn("Unexpected error sending Twilio SMS to {}: {}. Falling back to console log.",
                        EncryptedPhoneNumberConverter.encrypt(phoneNumber), e.getMessage());
            }
        }
        log.info("[MOCK SMS] To: {} | {}", EncryptedPhoneNumberConverter.encrypt(phoneNumber), message);
    }
}
