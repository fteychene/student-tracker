# Stage 1 — Build frontend
FROM node:alpine3.22 AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2 — Build Rust backend
FROM rust:1-slim-bookworm AS backend-builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev libgit2-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
# Cache dependencies by building a dummy main first
RUN mkdir src && echo 'fn main() {}' > src/main.rs && \
    cargo build --release && \
    rm -rf src
COPY src/ ./src/
COPY migrations/ ./migrations/
# Touch main.rs to force rebuild of the actual source
RUN touch src/main.rs && cargo build --release

# Stage 3 — Production image
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libgit2-1.5 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=backend-builder /app/target/release/student-result-tracker ./
COPY --from=frontend-builder /dist/ ./dist/
COPY migrations/ ./migrations/
EXPOSE 8080
CMD ["./student-result-tracker"]