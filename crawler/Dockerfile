FROM python:3.12-slim

RUN apt-get update && apt-get install -y \
    curl \
    tzdata \
    gcc \
    libpq-dev \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

ENV SUPERCRONIC_URL=https://github.com/aptible/supercronic/releases/download/v0.2.49/supercronic-linux-amd64 \
    SUPERCRONIC_SHA1SUM=e63c11a9726b775a6a11801e81af4f3fb926aa68 \
    SUPERCRONIC=supercronic-linux-amd64

RUN curl -fsSLO "$SUPERCRONIC_URL" \
 && echo "${SUPERCRONIC_SHA1SUM}  ${SUPERCRONIC}" | sha1sum -c - \
 && chmod +x "$SUPERCRONIC" \
 && mv "$SUPERCRONIC" "/usr/local/bin/${SUPERCRONIC}" \
 && ln -s "/usr/local/bin/${SUPERCRONIC}" /usr/local/bin/supercronic

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

COPY pyproject.toml uv.lock* ./

RUN uv sync --frozen --no-dev

COPY . .

ENV PATH="/app/.venv/bin:$PATH" \
    TZ=Asia/Taipei

RUN useradd -m -u 1000 crawler && mkdir -p /app/logs && chown -R crawler:crawler /app
USER crawler

CMD ["supercronic", "/app/crontab"]
