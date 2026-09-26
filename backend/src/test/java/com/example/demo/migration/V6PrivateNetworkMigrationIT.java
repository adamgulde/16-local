package com.example.demo.migration;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.configuration.FluentConfiguration;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies V6's schema and one-shot data copy against a hand-built pre-migration fixture. No Spring
 * context: applies V1..V5 via Flyway's {@code target} (an empty DB), inserts the fixture through
 * plain JDBC against the old (connections/user_tags/user_notes/connection_requests) tables, applies
 * V6, and asserts the private-network tables end up exactly as plan §4 P1 describes. Then re-runs
 * V6's data-copy SQL body a second time, verbatim from the migration file, to prove it never
 * duplicates a contact, tag, note or request.
 *
 * <p>Fixture: users A, B, C, D. Connections A-B and B-C (D is untouched, to prove isolation). A
 * privately tagged C and wrote a note on C — not connected, so both must land on the *same* one
 * unlinked placeholder contact. B wrote a note on A — connected, so it lands on B's REGISTERED
 * contact for A. A also self-tagged (must never become a contact tag). A pending
 * connection_requests row C -> A becomes a PENDING share_requests row.
 */
@Testcontainers
class V6PrivateNetworkMigrationIT {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    private static Connection db;

    private static UUID userA;
    private static UUID userB;
    private static UUID userC;
    private static UUID userD;
    private static UUID fixtureTagId;

    @BeforeAll
    static void migrateAndSeed() throws Exception {
        migrateTo("5");

        db = DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        db.setAutoCommit(true);
        seedFixture();

        migrateToLatest();
    }

    @AfterAll
    static void tearDown() throws Exception {
        if (db != null) {
            db.close();
        }
    }

    @Test
    void copiesLegacyDataOnceAndStaysIdempotentOnRerun() throws Exception {
        assertMigratedStateIsCorrect();

        // Re-run V6's data-copy SQL body a second time, verbatim from the migration file.
        try (Statement st = db.createStatement()) {
            st.execute(readDataCopySql());
        }

        assertMigratedStateIsCorrect();
    }

    private void assertMigratedStateIsCorrect() throws Exception {
        assertThat(count("contacts")).isEqualTo(5);
        assertThat(count("contact_tags")).isEqualTo(1);
        assertThat(count("share_requests")).isEqualTo(1);

        // The four REGISTERED contacts created from the two connections.
        assertRegisteredContact(userA, userB, "Bob", "Brown", null);
        assertRegisteredContact(userB, userC, "Carol", "Clark", null);
        assertRegisteredContact(userC, userB, "Bob", "Brown", null);
        // B's REGISTERED contact for A also carries B's note about A (they're connected).
        assertRegisteredContact(userB, userA, "Alice", "Anderson", "Alice owes me a coffee.");

        // A's UNLINKED placeholder for C: one contact carrying both the private tag and the note.
        UUID placeholderId = requireSingleUnlinkedContactId(userA, "Carol", "Clark");
        assertThat(noteOf(placeholderId)).isEqualTo("Met Carol at the conference.");
        assertThat(contactTagIdsOf(placeholderId)).containsExactly(fixtureTagId);

        // Self-tag must never become a contact tag; D must be untouched entirely.
        assertThat(countContactsForOwner(userD)).isZero();
        assertThat(countContactsLinkedTo(userD)).isZero();

        // Pending connection_requests C -> A became a PENDING share_requests row.
        try (PreparedStatement ps = db.prepareStatement(
                "SELECT sender_id, recipient_id, status FROM share_requests")) {
            try (ResultSet rs = ps.executeQuery()) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getObject("sender_id", UUID.class)).isEqualTo(userC);
                assertThat(rs.getObject("recipient_id", UUID.class)).isEqualTo(userA);
                assertThat(rs.getString("status")).isEqualTo("PENDING");
            }
        }
    }

    private void assertRegisteredContact(UUID owner, UUID linked, String firstName, String lastName, String expectedNote) throws Exception {
        try (PreparedStatement ps = db.prepareStatement(
                "SELECT first_name, last_name, phone_number, note FROM contacts WHERE owner_id = ? AND linked_user_id = ?")) {
            ps.setObject(1, owner);
            ps.setObject(2, linked);
            try (ResultSet rs = ps.executeQuery()) {
                assertThat(rs.next()).as("registered contact owner=%s linked=%s", owner, linked).isTrue();
                assertThat(rs.getString("first_name")).isEqualTo(firstName);
                assertThat(rs.getString("last_name")).isEqualTo(lastName);
                assertThat(rs.getString("phone_number")).isNull();
                assertThat(rs.getString("note")).isEqualTo(expectedNote);
                assertThat(rs.next()).isFalse();
            }
        }
    }

    private UUID requireSingleUnlinkedContactId(UUID owner, String firstName, String lastName) throws Exception {
        try (PreparedStatement ps = db.prepareStatement(
                "SELECT id, first_name, last_name FROM contacts WHERE owner_id = ? AND linked_user_id IS NULL")) {
            ps.setObject(1, owner);
            try (ResultSet rs = ps.executeQuery()) {
                assertThat(rs.next()).as("unlinked placeholder for owner=%s", owner).isTrue();
                assertThat(rs.getString("first_name")).isEqualTo(firstName);
                assertThat(rs.getString("last_name")).isEqualTo(lastName);
                UUID id = rs.getObject("id", UUID.class);
                assertThat(rs.next()).as("exactly one placeholder, not several").isFalse();
                return id;
            }
        }
    }

    private String noteOf(UUID contactId) throws Exception {
        try (PreparedStatement ps = db.prepareStatement("SELECT note FROM contacts WHERE id = ?")) {
            ps.setObject(1, contactId);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getString("note");
            }
        }
    }

    private java.util.List<UUID> contactTagIdsOf(UUID contactId) throws Exception {
        java.util.List<UUID> tagIds = new java.util.ArrayList<>();
        try (PreparedStatement ps = db.prepareStatement("SELECT tag_id FROM contact_tags WHERE contact_id = ?")) {
            ps.setObject(1, contactId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    tagIds.add(rs.getObject("tag_id", UUID.class));
                }
            }
        }
        return tagIds;
    }

    private long countContactsForOwner(UUID owner) throws Exception {
        try (PreparedStatement ps = db.prepareStatement("SELECT count(*) FROM contacts WHERE owner_id = ?")) {
            ps.setObject(1, owner);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getLong(1);
            }
        }
    }

    private long countContactsLinkedTo(UUID linkedUser) throws Exception {
        try (PreparedStatement ps = db.prepareStatement("SELECT count(*) FROM contacts WHERE linked_user_id = ?")) {
            ps.setObject(1, linkedUser);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getLong(1);
            }
        }
    }

    private long count(String table) throws Exception {
        try (Statement st = db.createStatement(); ResultSet rs = st.executeQuery("SELECT count(*) FROM " + table)) {
            rs.next();
            return rs.getLong(1);
        }
    }

    /** Extracts the "Data copy" section (8a..8f) verbatim from the shipped migration file. */
    private static String readDataCopySql() throws Exception {
        String script;
        try (InputStream in = V6PrivateNetworkMigrationIT.class.getClassLoader()
                .getResourceAsStream("db/migration/V6__private_network.sql")) {
            assertThat(in).as("V6 migration script must be on the classpath").isNotNull();
            script = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        int marker = script.indexOf("-- 8a.");
        assertThat(marker).as("data-copy marker '-- 8a.' must exist in the V6 migration script").isGreaterThan(-1);
        return script.substring(marker);
    }

    private static void migrateTo(String target) {
        configureFlyway().target(target).load().migrate();
    }

    private static void migrateToLatest() {
        configureFlyway().load().migrate();
    }

    private static FluentConfiguration configureFlyway() {
        return Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration");
    }

    private static void seedFixture() throws Exception {
        long neighborhood = insertNeighborhood();

        userA = insertUser("Alice", "Anderson", "+15550000101", "INVFIXA1", neighborhood);
        userB = insertUser("Bob", "Brown", "+15550000102", "INVFIXB1", neighborhood);
        userC = insertUser("Carol", "Clark", "+15550000103", "INVFIXC1", neighborhood);
        userD = insertUser("Dave", "Dixon", "+15550000104", "INVFIXD1", neighborhood);

        insertConnection(userA, userB);
        insertConnection(userB, userC);

        fixtureTagId = insertFixtureTag();

        // A tagged C privately, and separately wrote a note on C — not connected, must merge onto
        // one placeholder.
        insertUserTag(userA, userC, fixtureTagId);
        insertUserNote(userA, userC, "Met Carol at the conference.");

        // B wrote a note on A — connected, lands on B's REGISTERED contact for A.
        insertUserNote(userB, userA, "Alice owes me a coffee.");

        // Self-tag: must never become a contact tag.
        insertUserTag(userA, userA, fixtureTagId);

        // Pending share request C -> A.
        insertConnectionRequest(userC, userA, "PENDING");
    }

    private static long insertNeighborhood() throws Exception {
        try (PreparedStatement ps = db.prepareStatement(
                "INSERT INTO neighborhoods (member_count, created_at) VALUES (?, ?) RETURNING curve_index")) {
            ps.setLong(1, 4);
            ps.setObject(2, OffsetDateTime.now(ZoneOffset.UTC));
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getLong(1);
            }
        }
    }

    private static UUID insertUser(String first, String last, String phone, String inviteCode, long neighborhood) throws Exception {
        UUID id = UUID.randomUUID();
        try (PreparedStatement ps = db.prepareStatement(
                "INSERT INTO users (id, first_name, last_name, phone_number, invite_code, created_at, " +
                        "neighborhood_curve_index) VALUES (?, ?, ?, ?, ?, ?, ?)")) {
            ps.setObject(1, id);
            ps.setString(2, first);
            ps.setString(3, last);
            ps.setString(4, phone);
            ps.setString(5, inviteCode);
            ps.setObject(6, OffsetDateTime.now(ZoneOffset.UTC));
            ps.setLong(7, neighborhood);
            ps.executeUpdate();
        }
        return id;
    }

    private static void insertConnection(UUID a, UUID b) throws Exception {
        try (PreparedStatement ps = db.prepareStatement(
                "INSERT INTO connections (id, user_a_id, user_b_id, created_at) VALUES (?, ?, ?, ?)")) {
            ps.setObject(1, UUID.randomUUID());
            ps.setObject(2, a);
            ps.setObject(3, b);
            ps.setObject(4, OffsetDateTime.now(ZoneOffset.UTC));
            ps.executeUpdate();
        }
    }

    private static UUID insertFixtureTag() throws Exception {
        UUID id = UUID.randomUUID();
        try (PreparedStatement ps = db.prepareStatement(
                "INSERT INTO tags (id, category, label, level, display_order) VALUES (?, ?, ?, 1, 0)")) {
            ps.setObject(1, id);
            ps.setString(2, "Fixture");
            ps.setString(3, "Fixture Tag");
            ps.executeUpdate();
        }
        return id;
    }

    private static void insertUserTag(UUID tagger, UUID subject, UUID tagId) throws Exception {
        try (PreparedStatement ps = db.prepareStatement(
                "INSERT INTO user_tags (id, tagger_id, subject_id, tag_id) VALUES (?, ?, ?, ?)")) {
            ps.setObject(1, UUID.randomUUID());
            ps.setObject(2, tagger);
            ps.setObject(3, subject);
            ps.setObject(4, tagId);
            ps.executeUpdate();
        }
    }

    private static void insertUserNote(UUID author, UUID subject, String content) throws Exception {
        try (PreparedStatement ps = db.prepareStatement(
                "INSERT INTO user_notes (id, author_id, subject_id, content) VALUES (?, ?, ?, ?)")) {
            ps.setObject(1, UUID.randomUUID());
            ps.setObject(2, author);
            ps.setObject(3, subject);
            ps.setString(4, content);
            ps.executeUpdate();
        }
    }

    private static void insertConnectionRequest(UUID sender, UUID receiver, String status) throws Exception {
        try (PreparedStatement ps = db.prepareStatement(
                "INSERT INTO connection_requests (id, sender_id, receiver_id, status) VALUES (?, ?, ?, ?)")) {
            ps.setObject(1, UUID.randomUUID());
            ps.setObject(2, sender);
            ps.setObject(3, receiver);
            ps.setString(4, status);
            ps.executeUpdate();
        }
    }
}
