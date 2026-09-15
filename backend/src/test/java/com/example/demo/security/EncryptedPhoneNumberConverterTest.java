package com.example.demo.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class EncryptedPhoneNumberConverterTest {

    private EncryptedPhoneNumberConverter converter;

    @BeforeEach
    void setUp() {
        converter = new EncryptedPhoneNumberConverter();
        converter.setConfiguredKey("test-secret-key-for-unit-testing-32!");
    }

    @Test
    void convertToDatabaseColumn_producesDeterministicCiphertext() {
        String phone = "+12025550199";
        String cipher1 = converter.convertToDatabaseColumn(phone);
        String cipher2 = converter.convertToDatabaseColumn(phone);

        assertThat(cipher1).isNotNull();
        assertThat(cipher1).startsWith("enc:");
        assertThat(cipher1).isEqualTo(cipher2);
    }

    @Test
    void convertToDatabaseColumn_producesDifferentCiphertextForDifferentNumbers() {
        String phone1 = "+12025550199";
        String phone2 = "+12025550188";

        String cipher1 = converter.convertToDatabaseColumn(phone1);
        String cipher2 = converter.convertToDatabaseColumn(phone2);

        assertThat(cipher1).isNotEqualTo(cipher2);
    }

    @Test
    void roundTrip_restoresOriginalPhoneNumber() {
        String phone = "+1 (555) 234-5678";
        String encrypted = converter.convertToDatabaseColumn(phone);
        String decrypted = converter.convertToEntityAttribute(encrypted);

        assertThat(decrypted).isEqualTo(phone);
    }

    @Test
    void convertToEntityAttribute_handlesLegacyPlaintextWithoutPrefix() {
        String legacyPlaintext = "+12025550199";
        String result = converter.convertToEntityAttribute(legacyPlaintext);

        assertThat(result).isEqualTo(legacyPlaintext);
    }

    @Test
    void handlesNullAndBlankValues() {
        assertThat(converter.convertToDatabaseColumn(null)).isNull();
        assertThat(converter.convertToDatabaseColumn("")).isEmpty();
        assertThat(converter.convertToDatabaseColumn("   ")).isEqualTo("   ");

        assertThat(converter.convertToEntityAttribute(null)).isNull();
        assertThat(converter.convertToEntityAttribute("")).isEmpty();
        assertThat(converter.convertToEntityAttribute("   ")).isEqualTo("   ");
    }

    @Test
    void alreadyEncryptedValue_isNotDoubleEncrypted() {
        String phone = "+12025550199";
        String cipher = converter.convertToDatabaseColumn(phone);
        String doubleEnc = converter.convertToDatabaseColumn(cipher);

        assertThat(doubleEnc).isEqualTo(cipher);
    }
}
