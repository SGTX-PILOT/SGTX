# SGTX Brain OS — Dockerfile (multi-stage, production-ready)
FROM rust:1.81-bookworm AS builder

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy workspace
COPY Cargo.toml Cargo.lock ./
COPY crates/ crates/

# Build release binary
RUN cargo build --release --bin sgtx-brain

# ============ Runner ============
FROM debian:bookworm-slim AS runner

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -r -s /bin/false sgtx

WORKDIR /app

COPY --from=builder /app/target/release/sgtx-brain /app/sgtx-brain
COPY --from=builder /app/config /app/config

USER sgtx

EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["/app/sgtx-brain", "--health-check"] || exit 1

CMD ["/app/sgtx-brain"]
