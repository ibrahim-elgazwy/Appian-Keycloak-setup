# Keycloak 26.8.1 + the AQARAT external-roles extension (keycloak/extensions/aqarat-roles).
# Stage 1 builds the provider JAR against the same Keycloak version; stage 2 adds it to the official image and runs the
# build step once, so the server starts without re-augmenting. Realm files are mounted at runtime, never baked in.
# Used for realm aqarat-poc only (docker-compose.yml service keycloak, OpenShift sso-keycloak); the mock NAS keeps the
# stock image.
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY extensions/aqarat-roles/pom.xml .
RUN mvn -q -B dependency:go-offline
COPY extensions/aqarat-roles/src ./src
RUN mvn -q -B package

FROM quay.io/keycloak/keycloak:26.8.1
COPY --from=build /src/target/aqarat-roles.jar /opt/keycloak/providers/aqarat-roles.jar
# Build-time options must match the runtime ones (KC_DB, KC_HEALTH_ENABLED) or Keycloak rebuilds on start.
RUN /opt/keycloak/bin/kc.sh build --db=postgres --health-enabled=true
