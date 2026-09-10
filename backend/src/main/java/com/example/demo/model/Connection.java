package com.example.demo.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * An undirected edge between two users. Callers must always create these via
 * ConnectionService, which normalizes ordering (userA.id < userB.id) so a pair
 * can never be stored twice in reverse.
 */
@Entity
@Table(name = "connections", uniqueConstraints = @UniqueConstraint(columnNames = {"user_a_id", "user_b_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
@ToString(of = {"id"})
public class Connection {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "user_a_id")
    private User userA;

    @ManyToOne(optional = false)
    @JoinColumn(name = "user_b_id")
    private User userB;

    private Instant createdAt;
}
