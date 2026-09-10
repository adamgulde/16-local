package com.example.demo.repository;

import com.example.demo.model.Otp;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface OtpRepository extends JpaRepository<Otp, UUID> {
    Optional<Otp> findByPhoneNumber(String phoneNumber);
}
