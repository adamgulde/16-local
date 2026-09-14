package com.example.demo.repository;

import com.example.demo.model.Neighborhood;
import com.example.demo.model.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.junit.jupiter.Container;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@Testcontainers
public class UserRepositoryTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private NeighborhoodRepository neighborhoodRepository;

    @Test
    void shouldFindByPhoneNumber() {
        Neighborhood neighborhood = neighborhoodRepository.save(
                Neighborhood.builder().memberCount(1L).createdAt(java.time.Instant.now()).build());

        User user = User.builder()
                .firstName("John")
                .lastName("Doe")
                .phoneNumber("1234567890")
                .inviteCode("JOHNDOE1")
                .neighborhood(neighborhood)
                .build();
        userRepository.save(user);

        Optional<User> foundUser = userRepository.findByPhoneNumber("1234567890");
        assertThat(foundUser).isPresent();
        assertThat(foundUser.get().getFirstName()).isEqualTo("John");
    }
}
