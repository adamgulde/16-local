package com.example.demo.service;

import com.example.demo.model.Connection;
import com.example.demo.model.User;
import com.example.demo.repository.ConnectionRepository;
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
}
