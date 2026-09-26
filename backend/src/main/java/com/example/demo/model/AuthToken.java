package com.example.demo.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "auth_tokens")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
@ToString(of = {"id", "expiresAt"})
public class AuthToken {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(unique = true, nullable = false)
    private String token;

    /**
     * {@code auth_tokens.user_id} is {@code ON DELETE CASCADE} in V1's raw SQL, but tests run with
     * Flyway disabled and {@code ddl-auto=update} (the schema is generated straight from these
     * entity mappings), and Hibernate's own DDL generator defaults every FK to {@code NO ACTION}
     * unless told otherwise — {@link OnDelete} is what makes the *generated* schema match the real
     * migration's cascade instead of silently diverging from it (a real 500 on user deletion under
     * the Hibernate-generated schema is what surfaced this — see {@code UserAccountIT}).
     */
    @ManyToOne(optional = false)
    @JoinColumn(name = "user_id")
    @OnDelete(action = OnDeleteAction.CASCADE)
    private User user;

    private Instant expiresAt;
}
