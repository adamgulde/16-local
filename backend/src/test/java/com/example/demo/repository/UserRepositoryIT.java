package com.example.demo.repository;

import com.example.demo.TestcontainersConfiguration;
import com.example.demo.model.Neighborhood;
import com.example.demo.model.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
public class UserRepositoryIT {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private NeighborhoodRepository neighborhoodRepository;

    @Test
    void shouldFindByPhoneNumber() {
        String phone = "123" + String.format("%07d", System.currentTimeMillis() % 10000000);
        String invite = "INV" + String.format("%05d", System.currentTimeMillis() % 100000);

        Neighborhood neighborhood = neighborhoodRepository.save(
                Neighborhood.builder().memberCount(1L).createdAt(java.time.Instant.now()).build());

        User user = User.builder()
                .firstName("John")
                .lastName("Doe")
                .phoneNumber(phone)
                .inviteCode(invite)
                .neighborhood(neighborhood)
                .build();
        userRepository.save(user);

        Optional<User> foundUser = userRepository.findByPhoneNumber(phone);
        assertThat(foundUser).isPresent();
        assertThat(foundUser.get().getFirstName()).isEqualTo("John");
    }
}
