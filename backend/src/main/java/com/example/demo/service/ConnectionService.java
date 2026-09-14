package com.example.demo.service;

import com.example.demo.dto.FriendSummaryResponse;
import com.example.demo.model.Connection;
import com.example.demo.model.User;
import com.example.demo.repository.ConnectionRepository;
import com.example.demo.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

/**
 * Owns the connection graph. Relationships used to live as a JSON list of
 * neighbor ids on each User row; they now live in a normalized edge table so
 * they have referential integrity and can be queried/BFS'd without loading
 * every user in the directory on every request.
 */
@Service
@RequiredArgsConstructor
public class ConnectionService {

    private final ConnectionRepository connectionRepository;
    private final UserRepository userRepository;

    /** Idempotent: creating a connection that already exists (in either order) is a no-op. */
    public void connect(User a, User b) {
        if (a.getId().equals(b.getId())) {
            throw new IllegalArgumentException("A user cannot connect to themselves");
        }
        User first = a.getId().compareTo(b.getId()) < 0 ? a : b;
        User second = a.getId().compareTo(b.getId()) < 0 ? b : a;

        if (connectionRepository.existsByUserAIdAndUserBId(first.getId(), second.getId())) {
            return;
        }
        connectionRepository.save(Connection.builder()
                .userA(first)
                .userB(second)
                .createdAt(Instant.now())
                .build());
    }

    public boolean areConnected(UUID userId1, UUID userId2) {
        UUID first = userId1.compareTo(userId2) < 0 ? userId1 : userId2;
        UUID second = userId1.compareTo(userId2) < 0 ? userId2 : userId1;
        return connectionRepository.existsByUserAIdAndUserBId(first, second);
    }

    public List<UUID> getNeighborIds(UUID userId) {
        return connectionRepository.findByUserAIdOrUserBId(userId, userId).stream()
                .map(c -> c.getUserA().getId().equals(userId) ? c.getUserB().getId() : c.getUserA().getId())
                .toList();
    }

    /** Builds the full adjacency map from the edge table (far lighter than loading every User row). */
    private Map<UUID, List<UUID>> buildAdjacency() {
        Map<UUID, List<UUID>> adjacency = new HashMap<>();
        for (Connection c : connectionRepository.findAll()) {
            UUID a = c.getUserA().getId();
            UUID b = c.getUserB().getId();
            adjacency.computeIfAbsent(a, k -> new ArrayList<>()).add(b);
            adjacency.computeIfAbsent(b, k -> new ArrayList<>()).add(a);
        }
        return adjacency;
    }

    public List<UUID> findShortestPath(UUID startId, UUID targetId) {
        Map<UUID, List<UUID>> adjacency = buildAdjacency();

        Queue<UUID> queue = new LinkedList<>();
        queue.add(startId);
        Map<UUID, UUID> parentMap = new HashMap<>();
        parentMap.put(startId, null);

        while (!queue.isEmpty()) {
            UUID currentId = queue.poll();
            if (currentId.equals(targetId)) {
                return reconstructPath(parentMap, targetId);
            }
            for (UUID neighborId : adjacency.getOrDefault(currentId, List.of())) {
                if (!parentMap.containsKey(neighborId)) {
                    parentMap.put(neighborId, currentId);
                    queue.add(neighborId);
                }
            }
        }
        return Collections.emptyList();
    }

    private List<UUID> reconstructPath(Map<UUID, UUID> parentMap, UUID targetId) {
        List<UUID> path = new LinkedList<>();
        for (UUID at = targetId; at != null; at = parentMap.get(at)) {
            path.add(0, at);
        }
        return path;
    }

    /** Count of distinct users reachable from startId within maxDegree hops, excluding startId itself. */
    public int countReachableWithinDegree(UUID startId, int maxDegree) {
        Map<UUID, List<UUID>> adjacency = buildAdjacency();

        Set<UUID> visited = new HashSet<>();
        visited.add(startId);
        List<UUID> frontier = List.of(startId);

        for (int depth = 0; depth < maxDegree && !frontier.isEmpty(); depth++) {
            List<UUID> nextFrontier = new ArrayList<>();
            for (UUID current : frontier) {
                for (UUID neighborId : adjacency.getOrDefault(current, List.of())) {
                    if (visited.add(neighborId)) {
                        nextFrontier.add(neighborId);
                    }
                }
            }
            frontier = nextFrontier;
        }

        visited.remove(startId);
        return visited.size();
    }

    @org.springframework.transaction.annotation.Transactional
    public void disconnect(UUID userId1, UUID userId2) {
        UUID first = userId1.compareTo(userId2) < 0 ? userId1 : userId2;
        UUID second = userId1.compareTo(userId2) < 0 ? userId2 : userId1;
        connectionRepository.findByUserAIdAndUserBId(first, second)
                .ifPresent(connectionRepository::delete);
    }

    /** Returns BFS degree distance between startId and targetId (1 for direct, 2 for 2nd degree, etc., Integer.MAX_VALUE if unreachable). */
    public int getDegreeDistance(UUID startId, UUID targetId) {
        if (startId.equals(targetId)) return 0;
        Map<UUID, List<UUID>> adjacency = buildAdjacency();
        Queue<UUID> queue = new LinkedList<>();
        Map<UUID, Integer> dist = new HashMap<>();

        queue.add(startId);
        dist.put(startId, 0);

        while (!queue.isEmpty()) {
            UUID current = queue.poll();
            int d = dist.get(current);
            for (UUID neighbor : adjacency.getOrDefault(current, List.of())) {
                if (neighbor.equals(targetId)) {
                    return d + 1;
                }
                if (!dist.containsKey(neighbor)) {
                    dist.put(neighbor, d + 1);
                    queue.add(neighbor);
                }
            }
        }
        return Integer.MAX_VALUE;
    }

    public Set<UUID> getMutualFriendIds(UUID user1, UUID user2) {
        if (user1 == null || user2 == null || user1.equals(user2)) {
            return Collections.emptySet();
        }
        Set<UUID> n1 = new HashSet<>(getNeighborIds(user1));
        Set<UUID> n2 = new HashSet<>(getNeighborIds(user2));
        n1.retainAll(n2);
        n1.remove(user1);
        n1.remove(user2);
        return n1;
    }

    public List<FriendSummaryResponse> getUserFriends(UUID targetUserId, UUID viewerId, String sortBy, String order) {
        List<UUID> neighborIds = getNeighborIds(targetUserId);
        if (neighborIds.isEmpty()) {
            return Collections.emptyList();
        }

        // Do not include the logged in user in the friend's lists or friends of friends lists
        if (viewerId != null) {
            neighborIds = neighborIds.stream()
                    .filter(id -> !id.equals(viewerId))
                    .toList();
            if (neighborIds.isEmpty()) {
                return Collections.emptyList();
            }
        }

        Map<UUID, List<UUID>> adjacency = buildAdjacency();
        Set<UUID> viewerNeighbors = viewerId != null
                ? new HashSet<>(adjacency.getOrDefault(viewerId, List.of()))
                : Collections.emptySet();

        List<User> users = userRepository.findAllById(neighborIds);
        List<FriendSummaryResponse> responses = new ArrayList<>(users.size());

        for (User user : users) {
            UUID friendId = user.getId();
            List<UUID> friendRelationships = adjacency.getOrDefault(friendId, List.of());
            int connectionsCount = friendRelationships.size();

            int mutualFriendsCount = 0;
            if (viewerId != null && !friendId.equals(viewerId)) {
                Set<UUID> friendNeighbors = new HashSet<>(friendRelationships);
                mutualFriendsCount = (int) friendNeighbors.stream()
                        .filter(id -> !id.equals(viewerId) && !id.equals(friendId) && viewerNeighbors.contains(id))
                        .count();
            }

            boolean isConnectedToViewer = viewerId != null && (friendId.equals(viewerId) || viewerNeighbors.contains(friendId));
            boolean includePhoneNumber = isConnectedToViewer;

            responses.add(FriendSummaryResponse.from(
                    user,
                    friendRelationships,
                    includePhoneNumber,
                    connectionsCount,
                    mutualFriendsCount,
                    isConnectedToViewer
            ));
        }

        String effectiveSort = sortBy != null ? sortBy.toLowerCase() : "name";
        boolean desc;
        if (order != null) {
            desc = "desc".equalsIgnoreCase(order);
        } else {
            desc = "connections".equals(effectiveSort) || "mutualfriends".equals(effectiveSort);
        }

        Comparator<FriendSummaryResponse> nameComparator = Comparator.comparing(
                f -> {
                    String first = f.firstName() != null ? f.firstName() : "";
                    String last = f.lastName() != null ? f.lastName() : "";
                    return (first + " " + last).trim().toLowerCase();
                },
                Comparator.naturalOrder()
        );

        Comparator<FriendSummaryResponse> comparator;
        if ("connections".equals(effectiveSort)) {
            comparator = Comparator.comparingInt(FriendSummaryResponse::connectionsCount);
            if (desc) comparator = comparator.reversed();
            comparator = comparator.thenComparing(nameComparator);
        } else if ("mutualfriends".equals(effectiveSort)) {
            comparator = Comparator.comparingInt(FriendSummaryResponse::mutualFriendsCount);
            if (desc) comparator = comparator.reversed();
            comparator = comparator.thenComparing(nameComparator);
        } else {
            comparator = nameComparator;
            if (desc) comparator = comparator.reversed();
        }

        responses.sort(comparator);
        return responses;
    }
}

