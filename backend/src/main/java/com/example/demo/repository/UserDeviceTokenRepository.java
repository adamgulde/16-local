package com.example.demo.repository;

import com.example.demo.model.UserDeviceToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserDeviceTokenRepository extends JpaRepository<UserDeviceToken, UUID> {

    List<UserDeviceToken> findByUser_Id(UUID userId);

    Optional<UserDeviceToken> findByDeviceToken(String deviceToken);

    @Modifying
    @Transactional
    void deleteByDeviceTokenIn(Collection<String> deviceTokens);

    @Modifying
    @Transactional
    void deleteByDeviceTokenAndUser_Id(String deviceToken, UUID userId);
}
