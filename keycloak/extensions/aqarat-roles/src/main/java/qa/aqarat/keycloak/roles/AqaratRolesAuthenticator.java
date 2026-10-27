package qa.aqarat.keycloak.roles;

import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.AuthenticationFlowError;
import org.keycloak.authentication.Authenticator;
import org.keycloak.models.ClientModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.RoleModel;
import org.keycloak.models.UserModel;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Post-login step of the NAS broker: asks the Role API for the user's roles and stores them as client roles of
 * "aqarat-roles" (Keycloak database), before any token is created. Standard mappers then put them in the tokens.
 *
 * Only allow-listed roles of the roles client are touched: missing ones are granted, ones the API no longer returns
 * are removed. If the lookup cannot be trusted the login is refused (fail-closed); stored roles are never used as a
 * fallback.
 */
public class AqaratRolesAuthenticator implements Authenticator {

    static final String API_KEY_ENV = "AQ_ROLE_API_KEY";
    static final String FAILURE_MESSAGE = "Your permissions could not be checked right now. Please try again in a few minutes."
            + " / تعذر التحقق من صلاحياتك"
            + " الآن. يرجى المحاولة بعد"
            + " دقائق.";

    private static final Logger LOG = Logger.getLogger(AqaratRolesAuthenticator.class);
    private static final Pattern QID = Pattern.compile("^[23][0-9]{10}$");

    @Override
    public void authenticate(AuthenticationFlowContext context) {
        UserModel user = context.getUser();
        try {
            RolesConfig cfg = RolesConfig.from(context.getAuthenticatorConfig());
            String apiKey = System.getenv(API_KEY_ENV);
            if (apiKey == null || apiKey.isBlank()) {
                throw new RoleApiException(API_KEY_ENV + " is not set");
            }
            ClientModel holder = context.getRealm().getClientByClientId(cfg.rolesClientId());
            if (holder == null) {
                throw new RoleApiException("roles client " + cfg.rolesClientId() + " does not exist");
            }
            // The external ID comes from the user record (filled from the NAS qid), never from the browser.
            String qid = user.getFirstAttribute(cfg.idAttribute());
            if (qid == null || !QID.matcher(qid).matches()) {
                throw new RoleApiException("user has no valid " + cfg.idAttribute());
            }

            RoleResponseParser.Result result = new RoleApiClient(context.getSession()).fetchRoles(cfg, qid, apiKey);
            if (!result.rejected().isEmpty()) {
                LOG.warnf("AQARAT roles: user %s - %d role name(s) not on the allow-list were ignored",
                        user.getId(), result.rejected().size());
            }
            int changes = apply(user, holder, cfg.allowedRoles(), result.roles());
            LOG.debugf("AQARAT roles: user %s has %d role(s), %d change(s)", user.getId(), result.roles().size(), changes);
            context.success();
        } catch (RoleApiException e) {
            // Logged without the QID or role names (guide 9.3).
            LOG.warnf("AQARAT roles: login refused for user %s - %s", user == null ? "?" : user.getId(), e.getMessage());
            Response page = context.form().setError(FAILURE_MESSAGE).createErrorPage(Response.Status.SERVICE_UNAVAILABLE);
            context.failure(AuthenticationFlowError.INTERNAL_ERROR, page);
        }
    }

    /** Makes the user's allow-listed roles of the holder client equal to {@code wanted}. Returns the number of changes. */
    static int apply(UserModel user, ClientModel holder, Set<String> allowed, List<String> wanted) {
        Set<String> want = new HashSet<>(wanted);
        int changes = 0;
        for (RoleModel role : holder.getRolesStream().filter(r -> allowed.contains(r.getName())).toList()) {
            boolean has = user.hasDirectRole(role);
            if (want.remove(role.getName())) {
                if (!has) {
                    user.grantRole(role);
                    changes++;
                }
            } else if (has) {
                user.deleteRoleMapping(role);
                changes++;
            }
        }
        if (!want.isEmpty()) {
            LOG.warnf("AQARAT roles: %d allow-listed role(s) are not defined on client %s and were skipped",
                    want.size(), holder.getClientId());
        }
        return changes;
    }

    @Override
    public void action(AuthenticationFlowContext context) {
        context.success();
    }

    @Override
    public boolean requiresUser() {
        return true;
    }

    @Override
    public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) {
        return true;
    }

    @Override
    public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) {
    }

    @Override
    public void close() {
    }
}
