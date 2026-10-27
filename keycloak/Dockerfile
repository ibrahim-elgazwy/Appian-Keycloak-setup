# Keycloak 26.8.1 + the AQARAT external-roles extension (keycloak/extensions/aqarat-roles).
# Stage 1 builds the provider JAR against the same Keycloak version; stage 2 adds it to the official image. Realm files
# are mounted at runtime, never baked in. Used for realm aqarat-poc only (docker-compose.yml service keycloak, OpenShift
# sso-keycloak); the mock NAS keeps the stock image.
# No `kc.sh build` here: it needs more memory than OpenShift's build pod allows (killed, exit 137). `start` does the
# same build step on first start, as it already did with the stock image.
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY extensions/aqarat-roles/pom.xml .
RUN mvn -q -B dependency:go-offline
COPY extensions/aqarat-roles/src ./src
RUN mvn -q -B package

FROM quay.io/keycloak/keycloak:26.8.1
COPY --from=build /src/target/aqarat-roles.jar /opt/keycloak/providers/aqarat-roles.jar
