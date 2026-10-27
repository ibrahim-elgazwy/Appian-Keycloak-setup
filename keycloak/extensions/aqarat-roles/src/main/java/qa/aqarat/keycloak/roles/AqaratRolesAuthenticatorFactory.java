package qa.aqarat.keycloak.roles;

import org.keycloak.Config;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.models.AuthenticationExecutionModel.Requirement;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;
import org.keycloak.provider.ProviderConfigurationBuilder;

import java.util.List;

/** Registers "AQARAT external roles (Role API)" as an authentication step (META-INF/services). */
public class AqaratRolesAuthenticatorFactory implements AuthenticatorFactory {

    public static final String PROVIDER_ID = "aqarat-external-roles";
    private static final AqaratRolesAuthenticator SINGLETON = new AqaratRolesAuthenticator();

    private static final List<ProviderConfigProperty> CONFIG = ProviderConfigurationBuilder.create()
            .property().name(RolesConfig.ROLE_API_URL).label("Role API URL")
            .helpText("https URL with {qid}, e.g. https://api.aqarat.lab/internal/v1/users/{qid}/roles."
                    + " The service key is read from the AQ_ROLE_API_KEY environment variable.")
            .type(ProviderConfigProperty.STRING_TYPE).add()
            .property().name(RolesConfig.ALLOWED_ROLES).label("Allowed roles")
            .helpText("Role names accepted from the Role API. Others are ignored. Each must exist as a client role of the roles client.")
            .type(ProviderConfigProperty.MULTIVALUED_STRING_TYPE).add()
            .property().name(RolesConfig.ROLES_CLIENT_ID).label("Roles client")
            .helpText("Client whose client roles hold the external roles.")
            .type(ProviderConfigProperty.STRING_TYPE).defaultValue(RolesConfig.DEFAULT_ROLES_CLIENT_ID).add()
            .property().name(RolesConfig.ID_ATTRIBUTE).label("User ID attribute")
            .helpText("User attribute sent to the Role API as {qid}.")
            .type(ProviderConfigProperty.STRING_TYPE).defaultValue(RolesConfig.DEFAULT_ID_ATTRIBUTE).add()
            .property().name(RolesConfig.CONNECT_TIMEOUT_MS).label("Connect timeout (ms)")
            .type(ProviderConfigProperty.STRING_TYPE).defaultValue(String.valueOf(RolesConfig.DEFAULT_CONNECT_TIMEOUT_MS)).add()
            .property().name(RolesConfig.READ_TIMEOUT_MS).label("Read timeout (ms)")
            .type(ProviderConfigProperty.STRING_TYPE).defaultValue(String.valueOf(RolesConfig.DEFAULT_READ_TIMEOUT_MS)).add()
            .build();

    @Override
    public String getId() {
        return PROVIDER_ID;
    }

    @Override
    public String getDisplayType() {
        return "AQARAT external roles (Role API)";
    }

    @Override
    public String getHelpText() {
        return "Fetches the user's roles from the AQARAT Role API and stores them as client roles. Refuses the login if the lookup fails.";
    }

    @Override
    public String getReferenceCategory() {
        return null;
    }

    @Override
    public boolean isConfigurable() {
        return true;
    }

    @Override
    public Requirement[] getRequirementChoices() {
        return new Requirement[] {Requirement.REQUIRED, Requirement.DISABLED};
    }

    @Override
    public boolean isUserSetupAllowed() {
        return false;
    }

    @Override
    public List<ProviderConfigProperty> getConfigProperties() {
        return CONFIG;
    }

    @Override
    public Authenticator create(KeycloakSession session) {
        return SINGLETON;
    }

    @Override
    public void init(Config.Scope config) {
    }

    @Override
    public void postInit(KeycloakSessionFactory factory) {
    }

    @Override
    public void close() {
    }
}
