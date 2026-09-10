# Stage 1: Build (matches sourceCompatibility=21 in build.gradle)
FROM gradle:jdk21-alpine AS build
WORKDIR /app
COPY . /app/
RUN gradle build -x test

# Stage 2: Run
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/build/libs/*-SNAPSHOT.jar /app/app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
