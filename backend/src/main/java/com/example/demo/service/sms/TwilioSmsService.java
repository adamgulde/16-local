package com.example.demo.service.sms;

import com.twilio.Twilio;
import com.twilio.exception.ApiException;
import com.twilio.rest.api.v2010.account.Message;
import com.twilio.type.PhoneNumber;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;

@Service
public class TwilioSmsService implements SmsService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(TwilioSmsService.class);

    @Value("${twilio.account-sid:}")
    private String accountSid;

    @Value("${twilio.auth-token:}")
    private String authToken;

    @Value("${twilio.phone-number:}")
    private String twilioPhoneNumber;

    private boolean configured = false;

    @PostConstruct
    public void init() {
        if (accountSid != null) accountSid = accountSid.trim().replace("\"", "").replace("'", "");
        if (authToken != null) authToken = authToken.trim().replace("\"", "").replace("'", "");
        if (twilioPhoneNumber != null) twilioPhoneNumber = twilioPhoneNumber.trim().replace("\"", "").replace("'", "");

        if (accountSid != null && !accountSid.isBlank() && authToken != null && !authToken.isBlank()) {
            Twilio.init(accountSid, authToken);
            configured = true;
            log.info("Twilio SMS service initialized successfully");
        } else {
            log.warn("Twilio credentials not configured; SMS will be logged to console in dev mode");
        }
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
        if (configured && twilioPhoneNumber != null && !twilioPhoneNumber.isBlank()) {
            try {
                String to = toE164(phoneNumber);
                String from = toE164(twilioPhoneNumber);
                Message.creator(
                        new PhoneNumber(to),
                        new PhoneNumber(from),
                        message
                ).create();
                log.info("Twilio SMS successfully sent to {}", to);
                return;
            } catch (com.twilio.exception.ApiException e) {
                log.warn("Twilio API error sending SMS to {}: {} (code: {}). Falling back to console OTP.",
                        phoneNumber, e.getMessage(), e.getCode());
            } catch (Exception e) {
                log.warn("Unexpected error sending Twilio SMS to {}: {}. Falling back to console OTP.",
                        phoneNumber, e.getMessage());
            }
        }
        log.info("[MOCK SMS] To: {} | {}", phoneNumber, message);
    }
}
