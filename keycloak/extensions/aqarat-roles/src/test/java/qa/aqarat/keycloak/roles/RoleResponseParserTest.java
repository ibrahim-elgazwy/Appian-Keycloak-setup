package qa.aqarat.keycloak.roles;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class RoleResponseParserTest {

    private static final Set<String> ALLOWED = Set.of("PROPERTY_OWNER", "BROKER", "DEVELOPER", "BROKER_ADMIN");

    @Test
    void keepsAllowedRolesInOrderWithoutDuplicates() throws Exception {
        var r = RoleResponseParser.parse("{\"userId\":\"28463400001\",\"roles\":[\"BROKER\",\"PROPERTY_OWNER\",\"BROKER\"]}", ALLOWED);
        assertEquals(List.of("BROKER", "PROPERTY_OWNER"), r.roles());
        assertEquals(List.of(), r.rejected());
    }

    @Test
    void dropsRolesNotOnTheAllowList() throws Exception {
        var r = RoleResponseParser.parse("{\"roles\":[\"PROPERTY_OWNER\",\"SUPER_ADMIN\",\" \"]}", ALLOWED);
        assertEquals(List.of("PROPERTY_OWNER"), r.roles());
        assertEquals(List.of("SUPER_ADMIN"), r.rejected());
    }

    @Test
    void emptyRoleListMeansNoRoles() throws Exception {
        assertEquals(List.of(), RoleResponseParser.parse("{\"roles\":[]}", ALLOWED).roles());
    }

    @Test
    void rejectsMalformedAnswers() {
        for (String body : List.of("not json", "[]", "{}", "{\"roles\":\"BROKER\"}", "{\"roles\":[1]}", "null")) {
            assertThrows(RoleApiException.class, () -> RoleResponseParser.parse(body, ALLOWED), body);
        }
    }

    @Test
    void rejectsOversizedRoleLists() {
        String many = "{\"roles\":[" + "\"BROKER\",".repeat(RoleResponseParser.MAX_ROLES) + "\"BROKER\"]}";
        assertThrows(RoleApiException.class, () -> RoleResponseParser.parse(many, ALLOWED));
    }
}
