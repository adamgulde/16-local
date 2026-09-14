package com.example.demo.service;

import com.example.demo.dto.FriendSummaryResponse;
import com.example.demo.model.Connection;
import com.example.demo.model.User;
import com.example.demo.repository.ConnectionRepository;
import com.example.demo.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConnectionServiceTest {

    @Mock
    private ConnectionRepository connectionRepository;

    @Mock
    private UserRepository userRepository;

    private ConnectionService connectionService;

    private final UUID userAId = UUID.randomUUID(); // Viewer
    private final UUID userBId = UUID.randomUUID(); // Friend of A & C
    private final UUID userCId = UUID.randomUUID(); // Target user
    private final UUID userDId = UUID.randomUUID(); // Friend of C & B, but not A
    private final UUID userEId = UUID.randomUUID(); // Friend of C only

    private User userA, userB, userC, userD, userE;

    @BeforeEach
    void setUp() {
        connectionService = new ConnectionService(connectionRepository, userRepository);

        userA = User.builder().id(userAId).firstName("Alice").lastName("Anderson").phoneNumber("111-1111").build();
        userB = User.builder().id(userBId).firstName("Bob").lastName("Baker").phoneNumber("222-2222").build();
        userC = User.builder().id(userCId).firstName("Charlie").lastName("Clark").phoneNumber("333-3333").build();
        userD = User.builder().id(userDId).firstName("David").lastName("Davis").phoneNumber("444-4444").build();
        userE = User.builder().id(userEId).firstName("Edward").lastName("Evans").phoneNumber("555-5555").build();
    }

    private Connection conn(User u1, User u2) {
        User first = u1.getId().compareTo(u2.getId()) < 0 ? u1 : u2;
        User second = u1.getId().compareTo(u2.getId()) < 0 ? u2 : u1;
        return Connection.builder().id(UUID.randomUUID()).userA(first).userB(second).build();
    }

    @Test
    void getUserFriends_returnsEmptyList_whenNoNeighbors() {
        when(connectionRepository.findByUserAIdOrUserBId(userCId, userCId)).thenReturn(List.of());

        List<FriendSummaryResponse> friends = connectionService.getUserFriends(userCId, userAId, "name", "asc");

        assertThat(friends).isEmpty();
    }

    @Test
    void getUserFriends_calculatesMutualFriendsAndSortsCorrectly() {
        // Topology:
        // A (Viewer) is connected to B and C.
        // C (Target) is connected to A, B, D, E.
        // B is connected to A, C, D.
        // D is connected to B, C.
        // E is connected to C.
        List<Connection> allConnections = List.of(
                conn(userA, userB),
                conn(userA, userC),
                conn(userC, userB),
                conn(userC, userD),
                conn(userC, userE),
                conn(userB, userD)
        );

        when(connectionRepository.findAll()).thenReturn(allConnections);
        // C's direct connections:
        List<Connection> cConnections = allConnections.stream()
                .filter(c -> c.getUserA().getId().equals(userCId) || c.getUserB().getId().equals(userCId))
                .toList();
        when(connectionRepository.findByUserAIdOrUserBId(userCId, userCId)).thenReturn(cConnections);

        when(userRepository.findAllById(any())).thenReturn(List.of(userB, userD, userE));

        // When viewer A queries C's friends:
        // Alice (A, the viewer) is excluded!
        // - Bob (B) -> Connections: A, C, D (count = 3).
        //              Mutual friends with A: C is friend of A, and C is friend of B. Count = 1.
        // - David (D) -> Connections: B, C (count = 2).
        //                Mutual friends with A: B is friend of A and D; C is friend of A and D. Count = 2.
        // - Edward (E) -> Connections: C (count = 1).
        //                 Mutual friends with A: C is friend of A and E. Count = 1.

        // Test sorting by mutualFriends desc
        List<FriendSummaryResponse> sortByMutual = connectionService.getUserFriends(userCId, userAId, "mutualFriends", "desc");
        assertThat(sortByMutual).hasSize(3);
        assertThat(sortByMutual).extracting(FriendSummaryResponse::id).doesNotContain(userAId);
        assertThat(sortByMutual.get(0).id()).isEqualTo(userDId); // David has 2 mutual friends (B and C)
        assertThat(sortByMutual.get(0).mutualFriendsCount()).isEqualTo(2);

        // Test sorting by connections desc
        List<FriendSummaryResponse> sortByConnections = connectionService.getUserFriends(userCId, userAId, "connections", "desc");
        assertThat(sortByConnections.get(0).id()).isEqualTo(userBId); // Bob has 3 connections
        assertThat(sortByConnections.get(0).connectionsCount()).isEqualTo(3);

        // Test sorting by name asc (Alice excluded)
        List<FriendSummaryResponse> sortByName = connectionService.getUserFriends(userCId, userAId, "name", "asc");
        assertThat(sortByName).extracting(FriendSummaryResponse::firstName)
                .containsExactly("Bob", "David", "Edward");
    }

    @Test
    void getUserFriends_masksPhoneNumber_forNonConnections() {
        // A (Viewer) is connected to B.
        // C (Target) is connected to B and D.
        // A is not connected to D.
        List<Connection> allConnections = List.of(
                conn(userA, userB),
                conn(userC, userB),
                conn(userC, userD)
        );

        when(connectionRepository.findAll()).thenReturn(allConnections);
        List<Connection> cConnections = List.of(conn(userC, userB), conn(userC, userD));
        when(connectionRepository.findByUserAIdOrUserBId(userCId, userCId)).thenReturn(cConnections);
        when(userRepository.findAllById(any())).thenReturn(List.of(userB, userD));

        List<FriendSummaryResponse> friends = connectionService.getUserFriends(userCId, userAId, "name", "asc");

        FriendSummaryResponse bob = friends.stream().filter(f -> f.id().equals(userBId)).findFirst().orElseThrow();
        FriendSummaryResponse david = friends.stream().filter(f -> f.id().equals(userDId)).findFirst().orElseThrow();

        assertThat(bob.phoneNumber()).isEqualTo("222-2222"); // Connected to viewer A
        assertThat(bob.isConnectedToViewer()).isTrue();

        assertThat(david.phoneNumber()).isNull(); // Not connected to viewer A
        assertThat(david.isConnectedToViewer()).isFalse();
    }

    @Test
    void getMutualFriendIds_returnsSetIntersection() {
        // A is connected to B and D.
        // C is connected to B, D, and E.
        List<Connection> aConns = List.of(conn(userA, userB), conn(userA, userD));
        List<Connection> cConns = List.of(conn(userC, userB), conn(userC, userD), conn(userC, userE));

        when(connectionRepository.findByUserAIdOrUserBId(userAId, userAId)).thenReturn(aConns);
        when(connectionRepository.findByUserAIdOrUserBId(userCId, userCId)).thenReturn(cConns);

        Set<UUID> mutualIds = connectionService.getMutualFriendIds(userAId, userCId);

        assertThat(mutualIds).containsExactlyInAnyOrder(userBId, userDId);
    }
}
