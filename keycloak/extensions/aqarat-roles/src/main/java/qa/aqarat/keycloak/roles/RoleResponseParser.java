package qa.aqarat.keycloak.roles;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Reads the Role API answer {"userId": "...", "roles": ["..."], "version": "..."} and keeps only allow-listed roles.
 * Anything malformed throws, so a broken answer never turns into a token with guessed roles.
 */
final class RoleResponseParser {

    static final int MAX_ROLES = 50;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** Allowed roles found in the body, and the names that were dropped (not on the allow-list). */
    record Result(List<String> roles, List<String> rejected) {
    }

    private RoleResponseParser() {
    }

    static Result parse(String body, Set<String> allowed) throws RoleApiException {
        JsonNode root;
        try {
            root = MAPPER.readTree(body);
        } catch (IOException e) {
            throw new RoleApiException("Role API returned invalid JSON");
        }
        if (root == null || !root.isObject()) {
            throw new RoleApiException("Role API answer is not a JSON object");
        }
        JsonNode roles = root.get("roles");
        if (roles == null || !roles.isArray()) {
            throw new RoleApiException("Role API answer has no roles array");
        }
        if (roles.size() > MAX_ROLES) {
            throw new RoleApiException("Role API returned more than " + MAX_ROLES + " roles");
        }
        Set<String> kept = new LinkedHashSet<>();
        List<String> rejected = new ArrayList<>();
        for (JsonNode role : roles) {
            if (!role.isTextual()) {
                throw new RoleApiException("Role API returned a role that is not a string");
            }
            String name = role.asText().trim();
            if (name.isEmpty()) {
                continue;
            }
            if (allowed.contains(name)) {
                kept.add(name);
            } else {
                rejected.add(name);
            }
        }
        return new Result(List.copyOf(kept), List.copyOf(rejected));
    }
}
