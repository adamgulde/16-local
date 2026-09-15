package com.example.demo.config;

import com.example.demo.model.ConnectionRequest;
import com.example.demo.model.Tag;
import com.example.demo.model.User;
import com.example.demo.repository.ConnectionRequestRepository;
import com.example.demo.repository.TagRepository;
import com.example.demo.repository.UserRepository;
import com.example.demo.service.ConnectionService;
import com.example.demo.service.PlacementService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import java.util.*;

@Configuration
@Profile("!prod")
@ConditionalOnProperty(name = "app.db.init.enabled", havingValue = "true", matchIfMissing = true)
public class DatabaseInitializer {

    /**
     * Marvel, DC, and video-game character names for seed users 6+ (1-5 stay generic "User N"),
     * so the demo directory has recognizable, distinct-looking entries instead of a wall of
     * "User 6".."User 105". Order only matters in that it's assigned sequentially by user
     * number; falls back to "User N" if ever exhausted (see nameFor below).
     */
    private static final String[][] CHARACTER_NAMES = {
            {"Tony", "Stark"}, {"Steve", "Rogers"}, {"Natasha", "Romanoff"}, {"Bruce", "Banner"},
            {"Peter", "Parker"}, {"Wanda", "Maximoff"}, {"Stephen", "Strange"}, {"Carol", "Danvers"},
            {"Scott", "Lang"}, {"Clint", "Barton"}, {"Sam", "Wilson"}, {"Bucky", "Barnes"},
            {"Reed", "Richards"}, {"Susan", "Storm"}, {"Johnny", "Storm"}, {"Ben", "Grimm"},
            {"Charles", "Xavier"}, {"Erik", "Lehnsherr"}, {"Jean", "Grey"}, {"Scott", "Summers"},
            {"Ororo", "Munroe"}, {"Logan", "Howlett"}, {"Hank", "McCoy"}, {"Kurt", "Wagner"},
            {"Piotr", "Rasputin"}, {"Kitty", "Pryde"}, {"Matt", "Murdock"}, {"Jessica", "Jones"},
            {"Luke", "Cage"}, {"Danny", "Rand"}, {"Frank", "Castle"}, {"Eddie", "Brock"},
            {"Miles", "Morales"}, {"Gwen", "Stacy"}, {"Peter", "Quill"}, {"Gamora", "Whoberi"},
            {"Nick", "Fury"}, {"Maria", "Hill"}, {"Kamala", "Khan"}, {"Wade", "Wilson"},
            {"Bruce", "Wayne"}, {"Clark", "Kent"}, {"Diana", "Prince"}, {"Barry", "Allen"},
            {"Hal", "Jordan"}, {"Arthur", "Curry"}, {"Victor", "Stone"}, {"Dick", "Grayson"},
            {"Jason", "Todd"}, {"Tim", "Drake"}, {"Damian", "Wayne"}, {"Barbara", "Gordon"},
            {"Kara", "Zor-El"}, {"Oliver", "Queen"}, {"Dinah", "Lance"}, {"Billy", "Batson"},
            {"Kate", "Kane"}, {"Selina", "Kyle"}, {"Harvey", "Dent"}, {"Edward", "Nigma"},
            {"Pamela", "Isley"}, {"Jonathan", "Crane"}, {"Oswald", "Cobblepot"}, {"John", "Constantine"},
            {"Zatanna", "Zatara"}, {"John", "Stewart"}, {"Kyle", "Rayner"}, {"Wally", "West"},
            {"Roy", "Harper"}, {"Lois", "Lane"}, {"Jimmy", "Olsen"}, {"Alfred", "Pennyworth"},
            {"Lucius", "Fox"}, {"Talia", "al Ghul"}, {"Helena", "Bertinelli"}, {"Master", "Chief"},
            {"Solid", "Snake"}, {"Lara", "Croft"}, {"Nathan", "Drake"}, {"Ellie", "Williams"},
            {"Joel", "Miller"}, {"Geralt", "Rivia"}, {"Samus", "Aran"}, {"Cloud", "Strife"},
            {"Tifa", "Lockhart"}, {"Aerith", "Gainsborough"}, {"Squall", "Leonhart"}, {"Leon", "Kennedy"},
            {"Chris", "Redfield"}, {"Jill", "Valentine"}, {"Ada", "Wong"}, {"Dante", "Sparda"},
            {"Vergil", "Sparda"}, {"Ryu", "Hoshi"}, {"Ken", "Masters"}, {"Cammy", "White"},
            {"Rock", "Light"}, {"John", "Shepard"}, {"Garrus", "Vakarian"}, {"Liara", "Tsoni"},
    };

    /** Fixed seed so the demo graph's sponsor-tree shape (which member sponsors which) is reproducible across reseeds. */
    private static final Random SEED_RANDOM = new Random(42L);

    /**
     * Seed a demo directory spanning several neighborhoods of varying size, so the map isn't
     * just one or two clusters — enough to see how placement/spacing behaves across a handful
     * of distinct neighborhoods, and to exercise multi-hop find-path across all of them.
     * Each seed user gets a login of "user1".."userN" / "password123" purely for local
     * demo/testing convenience — not a pattern to reuse for real accounts.
     *
     * <p>Every non-founder is actually connected to a sponsor (a real accepted Connection, as if
     * the sponsor request had already been accepted) — this is what production registration
     * guarantees, and what makes "same neighborhood implies a path exists" hold. The one
     * exception is deliberate: each neighborhood's last-added member is left with a PENDING
     * sponsor request instead, so the pending/dashed-line connection visual still has a live
     * example to render.
     */
    @Bean
    CommandLineRunner initDatabase(UserRepository userRepository,
                                    ConnectionRequestRepository connectionRequestRepository,
                                    ConnectionService connectionService,
                                    PlacementService placementService) {
        return args -> {
            if (userRepository.count() > 0) {
                List<User> existing = userRepository.findAll();
                Map<Integer, User> userByNum = new HashMap<>();

                for (User u : existing) {
                    int num = getNumberForUser(u);
                    if (num >= 0 && num <= 105) {
                        String canonicalPhone = String.format("+1 555-000-%04d", num);
                        u.setPhoneNumber(canonicalPhone);
                        u.setDefaultUser(true);
                        if (u.getInviteCode() == null || u.getInviteCode().isBlank()) {
                            u.setInviteCode(String.format("INV%04d", num));
                        }
                        userRepository.save(u);
                        userByNum.put(num, u);
                    }
                }

                User anchor = userByNum.get(1);
                if (anchor == null && !existing.isEmpty()) {
                    anchor = existing.get(0);
                }

                if (anchor != null) {
                    for (int i = 0; i <= 105; i++) {
                        if (!userByNum.containsKey(i)) {
                            String[] name = nameFor(i);
                            User u = User.builder()
                                    .firstName(name[0])
                                    .lastName(name[1])
                                    .phoneNumber(String.format("+1 555-000-%04d", i))
                                    .inviteCode(String.format("INV%04d", i))
                                    .defaultUser(true)
                                    .createdAt(java.time.Instant.now())
                                    .build();
                            u = placementService.joinNeighborhood(u, anchor.getNeighborhood());
                            userRepository.save(u);
                            User connectTo = userByNum.get(i > 0 ? i - 1 : 1);
                            if (connectTo == null) connectTo = anchor;
                            connectionService.connect(u, connectTo);
                            userByNum.put(i, u);
                        }
                    }
                }
                return;
            }

            // First two sizes (10, 10) preserved from the original two-neighborhood seed so
            // existing usernames/connections below still line up; the rest are new.
            int[] neighborhoodSizes = {10, 10, 15, 5, 25, 8, 12, 20};
            List<User> users = new ArrayList<>();
            int nextNumber = 1;
            for (int size : neighborhoodSizes) {
                nextNumber = seedNeighborhood(nextNumber, size, users, placementService,
                        connectionRequestRepository, connectionService);
            }

            // Seed User 0 (+1 555-000-0000) and connect to User 1
            User user0 = User.builder()
                    .firstName("User")
                    .lastName("0")
                    .phoneNumber("+1 555-000-0000")
                    .inviteCode("INV0000")
                    .defaultUser(true)
                    .createdAt(java.time.Instant.now())
                    .build();
            user0 = placementService.joinNeighborhood(user0, users.get(0).getNeighborhood());
            userRepository.save(user0);
            connectionService.connect(user0, users.get(0));

            // Extra hand-picked edges layered on top of the guaranteed sponsor tree, purely for
            // a richer/denser social graph (multiple routes between members, not just one).
            // Connections reference users by seed number (1-indexed, matching username "userN"),
            // not by name — most users past #5 no longer have a generic, uniquely-searchable name.
            connect(users, connectionService, 1, 2);
            connect(users, connectionService, 1, 3);
            connect(users, connectionService, 2, 5);
            connect(users, connectionService, 4, 7);
            connect(users, connectionService, 5, 8);
            connect(users, connectionService, 6, 9);
            connect(users, connectionService, 7, 10);
            connect(users, connectionService, 8, 11);
            connect(users, connectionService, 9, 12);
            connect(users, connectionService, 10, 13);
            connect(users, connectionService, 11, 14);
            connect(users, connectionService, 12, 15);
            connect(users, connectionService, 13, 16);
            connect(users, connectionService, 14, 17);
            connect(users, connectionService, 16, 19);
            connect(users, connectionService, 17, 20);
            connect(users, connectionService, 18, 1);
            connect(users, connectionService, 19, 2);
            connect(users, connectionService, 20, 3);

            // One bridge connection per neighborhood boundary, chaining all of them together so
            // find-path has a multi-hop, multi-neighborhood route to actually traverse. Anchored
            // on each neighborhood's founder (numbers 21, 36, 41, 66, 74, 86) rather than its last
            // member — the last member of every neighborhood is deliberately the one left with
            // an unaccepted (pending) sponsor request, so bridging through them would only ever
            // connect that one isolated straggler, silently leaving the rest of the neighborhood
            // fragmented from everything past it.
            connect(users, connectionService, 11, 21);
            connect(users, connectionService, 21, 36);
            connect(users, connectionService, 36, 41);
            connect(users, connectionService, 41, 66);
            connect(users, connectionService, 66, 74);
            connect(users, connectionService, 74, 86);
        };
    }

    public static int getNumberForUser(User u) {
        if ("User".equalsIgnoreCase(u.getFirstName())) {
            try {
                return Integer.parseInt(u.getLastName().trim());
            } catch (Exception ignored) {}
        }
        for (int i = 0; i < CHARACTER_NAMES.length; i++) {
            if (CHARACTER_NAMES[i][0].equalsIgnoreCase(u.getFirstName())
                    && CHARACTER_NAMES[i][1].equalsIgnoreCase(u.getLastName())) {
                return i + 6;
            }
        }
        if (u.getPhoneNumber() != null && u.getPhoneNumber().matches("^\\+?1?555000\\d{4}$|^\\+1 555-000-\\d{4}$")) {
            String digits = u.getPhoneNumber().replaceAll("\\D", "");
            if (digits.length() >= 4) {
                try {
                    return Integer.parseInt(digits.substring(digits.length() - 4));
                } catch (Exception ignored) {}
            }
        }
        if (u.getPhoneNumber() != null && u.getPhoneNumber().startsWith("1000000")) {
            try {
                return Integer.parseInt(u.getPhoneNumber()) - 100000000;
            } catch (Exception ignored) {}
        }
        return -1;
    }

    /**
     * Starter tag dictionary — a small, generic set for the two categories asked for. Adding
     * more later is just inserting more rows here, no schema change needed. Independent
     * CommandLineRunner (own guard) so it never touches the delicate user-seeding logic above.
     */
    @Bean
    CommandLineRunner initTags(TagRepository tagRepository) {
        return args -> {
            if (tagRepository.count() > 0) {
                return;
            }
            String[] regions = {"North America", "South America", "Europe", "Africa", "Asia", "Oceania"};
            String[] interests = {"Sports", "Music", "Technology", "Travel", "Reading", "Gaming", "Cooking", "Art"};
            for (String region : regions) {
                tagRepository.save(Tag.builder().category("Region").label(region).build());
            }
            for (String interest : interests) {
                tagRepository.save(Tag.builder().category("Interest").label(interest).build());
            }
        };
    }

    /**
     * Founds a new neighborhood at userNumbers[startNumber, startNumber+size). Each joiner
     * (offset > 0) picks a sponsor pseudo-randomly from whoever has already joined this
     * neighborhood — an organic branching tree rather than everyone hanging directly off the
     * founder — and connects to them: accepted for every joiner except the very last, who's
     * left with a PENDING sponsor request (see class javadoc).
     */
    private int seedNeighborhood(int startNumber, int size, List<User> users, PlacementService placementService,
                                  ConnectionRequestRepository connectionRequestRepository,
                                  ConnectionService connectionService) {
        List<User> members = new ArrayList<>();
        for (int offset = 0; offset < size; offset++) {
            int number = startNumber + offset;
            String[] name = nameFor(number);
            User user = User.builder()
                    .firstName(name[0])
                    .lastName(name[1])
                    .phoneNumber(String.format("+1 555-000-%04d", number))
                    .inviteCode("INV" + String.format("%04d", number))
                    .defaultUser(true)
                    .createdAt(java.time.Instant.now())
                    .build();

            User sponsor = null;
            if (offset == 0) {
                user = placementService.foundNeighborhood(user);
            } else {
                sponsor = members.get(SEED_RANDOM.nextInt(members.size()));
                user = placementService.joinNeighborhood(user, sponsor.getNeighborhood());
            }

            if (sponsor != null) {
                boolean isLastJoiner = offset == size - 1;
                if (isLastJoiner) {
                    connectionRequestRepository.save(ConnectionRequest.builder()
                            .sender(user)
                            .receiver(sponsor)
                            .status(ConnectionRequest.RequestStatus.PENDING)
                            .build());
                } else {
                    connectionService.connect(user, sponsor);
                }
            }

            members.add(user);
            users.add(user);
        }
        return startNumber + size;
    }

    /** Users 1-5 stay generic ("User N"); 6+ draw from CHARACTER_NAMES, falling back to "User N" if exhausted. */
    private String[] nameFor(int number) {
        if (number <= 5) {
            return new String[]{"User", String.valueOf(number)};
        }
        int idx = number - 6;
        if (idx < CHARACTER_NAMES.length) {
            return CHARACTER_NAMES[idx];
        }
        return new String[]{"User", String.valueOf(number)};
    }

    private void connect(List<User> users, ConnectionService connectionService, int number1, int number2) {
        connectionService.connect(users.get(number1 - 1), users.get(number2 - 1));
    }
}
