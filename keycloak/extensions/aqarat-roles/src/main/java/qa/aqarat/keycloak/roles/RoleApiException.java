package qa.aqarat.keycloak.roles;

/** The role lookup could not be trusted (network, status, body). The login is refused: fail-closed. */
public class RoleApiException extends Exception {

    public RoleApiException(String message) {
        super(message);
    }

    public RoleApiException(String message, Throwable cause) {
        super(message, cause);
    }
}
