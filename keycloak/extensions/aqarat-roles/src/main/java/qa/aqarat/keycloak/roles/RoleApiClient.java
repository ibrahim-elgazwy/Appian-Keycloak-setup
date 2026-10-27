package qa.aqarat.keycloak.roles;

import org.apache.http.HttpEntity;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpGet;
import org.keycloak.connections.httpclient.HttpClientProvider;
import org.keycloak.models.KeycloakSession;

import java.io.IOException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Calls GET {roleApiUrl with {qid}} with the service key. Uses Keycloak's own HTTP client, so the call trusts the same
 * certificates as Keycloak (KC_TRUSTSTORE_PATHS) and verifies host names.
 */
final class RoleApiClient {

    static final String API_KEY_HEADER = "X-Role-Api-Key";
    private static final int MAX_BODY_BYTES = 64 * 1024;

    private final KeycloakSession session;

    RoleApiClient(KeycloakSession session) {
        this.session = session;
    }

    RoleResponseParser.Result fetchRoles(RolesConfig cfg, String qid, String apiKey) throws RoleApiException {
        String url = cfg.roleApiUrl().replace("{qid}", URLEncoder.encode(qid, StandardCharsets.UTF_8));
        HttpGet get = new HttpGet(url);
        get.setConfig(RequestConfig.custom()
                .setConnectTimeout(cfg.connectTimeoutMs())
                .setConnectionRequestTimeout(cfg.connectTimeoutMs())
                .setSocketTimeout(cfg.readTimeoutMs())
                .build());
        get.setHeader("Accept", "application/json");
        get.setHeader(API_KEY_HEADER, apiKey);

        // No retries: a retry in the login path only stretches an outage (guide 9.4).
        try (CloseableHttpResponse response = session.getProvider(HttpClientProvider.class).getHttpClient().execute(get)) {
            int status = response.getStatusLine().getStatusCode();
            if (status == 404) {
                return new RoleResponseParser.Result(List.of(), List.of()); // unknown user = no roles (contract D2)
            }
            if (status != 200) {
                throw new RoleApiException("Role API returned HTTP " + status);
            }
            return RoleResponseParser.parse(readLimited(response.getEntity()), cfg.allowedRoles());
        } catch (IOException e) {
            throw new RoleApiException("Role API call failed: " + e.getClass().getSimpleName(), e);
        }
    }

    private static String readLimited(HttpEntity entity) throws IOException, RoleApiException {
        if (entity == null) {
            throw new RoleApiException("Role API returned no body");
        }
        try (InputStream in = entity.getContent()) {
            byte[] body = in.readNBytes(MAX_BODY_BYTES + 1);
            if (body.length > MAX_BODY_BYTES) {
                throw new RoleApiException("Role API answer is larger than " + MAX_BODY_BYTES + " bytes");
            }
            return new String(body, StandardCharsets.UTF_8);
        }
    }
}
