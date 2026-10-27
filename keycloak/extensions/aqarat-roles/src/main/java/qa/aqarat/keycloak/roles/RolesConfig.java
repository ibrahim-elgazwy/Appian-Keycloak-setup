package qa.aqarat.keycloak.roles;

import org.keycloak.models.AuthenticatorConfigModel;
import org.keycloak.models.Constants;

import java.util.Arrays;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Settings of one "AQARAT external roles" execution (Keycloak admin console: the step's gear icon). The service key is
 * deliberately not here: config is visible to realm admins, so the key comes from the environment (AQ_ROLE_API_KEY).
 */
record RolesConfig(String roleApiUrl, Set<String> allowedRoles, String rolesClientId, String idAttribute,
                   int connectTimeoutMs, int readTimeoutMs) {

    static final String ROLE_API_URL = "roleApiUrl";
    static final String ALLOWED_ROLES = "allowedRoles";
    static final String ROLES_CLIENT_ID = "rolesClientId";
    static final String ID_ATTRIBUTE = "idAttribute";
    static final String CONNECT_TIMEOUT_MS = "connectTimeoutMs";
    static final String READ_TIMEOUT_MS = "readTimeoutMs";

    static final String DEFAULT_ROLES_CLIENT_ID = "aqarat-roles";
    static final String DEFAULT_ID_ATTRIBUTE = "national_id";
    static final int DEFAULT_CONNECT_TIMEOUT_MS = 1000;
    static final int DEFAULT_READ_TIMEOUT_MS = 2000;

    static RolesConfig from(AuthenticatorConfigModel model) throws RoleApiException {
        Map<String, String> c = model == null || model.getConfig() == null ? Map.of() : model.getConfig();
        String url = c.getOrDefault(ROLE_API_URL, "").trim();
        if (!url.startsWith("https://") || !url.contains("{qid}")) {
            throw new RoleApiException("roleApiUrl must be an https URL containing {qid}");
        }
        Set<String> allowed = Arrays.stream(c.getOrDefault(ALLOWED_ROLES, "").split(Constants.CFG_DELIMITER))
                .map(String::trim).filter(s -> !s.isEmpty()).collect(Collectors.toUnmodifiableSet());
        return new RolesConfig(url, allowed,
                nonBlank(c.get(ROLES_CLIENT_ID), DEFAULT_ROLES_CLIENT_ID),
                nonBlank(c.get(ID_ATTRIBUTE), DEFAULT_ID_ATTRIBUTE),
                millis(c.get(CONNECT_TIMEOUT_MS), DEFAULT_CONNECT_TIMEOUT_MS),
                millis(c.get(READ_TIMEOUT_MS), DEFAULT_READ_TIMEOUT_MS));
    }

    private static String nonBlank(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private static int millis(String value, int fallback) {
        try {
            int ms = Integer.parseInt(value == null ? "" : value.trim());
            return ms > 0 && ms <= 10_000 ? ms : fallback;
        } catch (NumberFormatException e) {
            return fallback;
        }
    }
}
