package com.example.demo.service.email;

public interface EmailService {
    void sendEmail(String toEmail, String subject, String body);
}
