package com.example.demo.security;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;

/**
 * Transparently encrypts phone numbers before writing to the database, and decrypts them on read.
 * Uses deterministic AES-256-CBC (IV derived via HMAC-SHA256 of plaintext) so exact-match lookups
 * and unique constraints continue to work. Legacy unencrypted values (without "enc:" prefix) are
 * read as plaintext and encrypted automatically on subsequent saves.
 */
@Slf4j
@Converter
@Component
public class EncryptedPhoneNumberConverter implements AttributeConverter<String, String> {

    public static String encrypt(String plaintext) {
        return new EncryptedPhoneNumberConverter().convertToDatabaseColumn(plaintext);
    }

    private static final String PREFIX = "enc:";
    private static final String DEFAULT_SECRET = "connectionsbetween-us-default-secret-key-2026!";
    private static volatile byte[] cachedAesKey;

    public EncryptedPhoneNumberConverter() {
        if (cachedAesKey == null) {
            String envKey = System.getenv("APP_ENCRYPTION_KEY");
            initKey(envKey != null && !envKey.isBlank() ? envKey : DEFAULT_SECRET);
        }
    }

    @Value("${app.security.encryption-key:}")
    public void setConfiguredKey(String key) {
        if (key != null && !key.isBlank()) {
            initKey(key);
        }
    }

    private static synchronized void initKey(String secret) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            cachedAesKey = md.digest(secret.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            log.error("Failed to initialize AES key for EncryptedPhoneNumberConverter", e);
            cachedAesKey = Arrays.copyOf(secret.getBytes(StandardCharsets.UTF_8), 32);
        }
    }

    private byte[] getAesKey() {
        if (cachedAesKey == null) {
            String envKey = System.getenv("APP_ENCRYPTION_KEY");
            initKey(envKey != null && !envKey.isBlank() ? envKey : DEFAULT_SECRET);
        }
        return cachedAesKey;
    }

    @Override
    public String convertToDatabaseColumn(String attribute) {
        if (attribute == null || attribute.isBlank()) {
            return attribute;
        }
        if (attribute.startsWith(PREFIX)) {
            return attribute;
        }

        try {
            byte[] key = getAesKey();
            // Derive deterministic 16-byte IV via HMAC-SHA256
            Mac hmac = Mac.getInstance("HmacSHA256");
            hmac.init(new SecretKeySpec(key, "HmacSHA256"));
            byte[] hmacBytes = hmac.doFinal(attribute.getBytes(StandardCharsets.UTF_8));
            byte[] iv = Arrays.copyOf(hmacBytes, 16);

            Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new IvParameterSpec(iv));
            byte[] cipherText = cipher.doFinal(attribute.getBytes(StandardCharsets.UTF_8));

            byte[] combined = new byte[iv.length + cipherText.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(cipherText, 0, combined, iv.length, cipherText.length);

            return PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(combined);
        } catch (Exception e) {
            log.error("Error encrypting phone number", e);
            throw new IllegalStateException("Could not encrypt phone number", e);
        }
    }

    @Override
    public String convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.isBlank()) {
            return dbData;
        }
        // Legacy plaintext fallback
        if (!dbData.startsWith(PREFIX)) {
            return dbData;
        }

        try {
            byte[] key = getAesKey();
            String payload = dbData.substring(PREFIX.length());
            byte[] combined = Base64.getUrlDecoder().decode(payload);
            if (combined.length < 16) {
                log.warn("Encrypted phone number payload is shorter than IV length, returning as-is");
                return dbData;
            }

            byte[] iv = Arrays.copyOfRange(combined, 0, 16);
            byte[] cipherText = Arrays.copyOfRange(combined, 16, combined.length);

            Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new IvParameterSpec(iv));
            byte[] plainBytes = cipher.doFinal(cipherText);

            return new String(plainBytes, StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.error("Failed to decrypt phone number, returning raw db data", e);
            return dbData;
        }
    }
}
