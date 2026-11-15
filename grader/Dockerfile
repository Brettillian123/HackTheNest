# Grader service: scores submitted sites in headless Chromium.
# Build and run instructions: service/README.md.
FROM node:24-bookworm-slim

# Browsers live outside any home folder so the non-root user can read them.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Fonts. Goal pages use Arial, Georgia and Courier New stacks, and scores
# depend on how much space text takes.
#  - fonts-liberation: Liberation Sans / Mono, metric-compatible with Arial /
#    Courier New (fontconfig maps the names automatically).
#  - ttf-mscorefonts-installer (Debian contrib): the real Arial, Georgia and
#    Courier New. Liberation has no Georgia match. It downloads the fonts
#    during the build; build with --build-arg CORE_FONTS=0 if that download
#    is unavailable (Georgia then falls back to another serif font).
ARG CORE_FONTS=1
RUN set -eux; \
    sed -i 's/^Components: main$/Components: main contrib/' /etc/apt/sources.list.d/debian.sources; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates fontconfig fonts-liberation; \
    if [ "$CORE_FONTS" = "1" ]; then \
      echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" | debconf-set-selections; \
      apt-get install -y --no-install-recommends ttf-mscorefonts-installer; \
    fi; \
    fc-cache -f; \
    fc-match Arial; fc-match Georgia; fc-match "Courier New"; \
    if [ "$CORE_FONTS" = "1" ]; then fc-match Georgia | grep -qi georgia; fi; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies, then the Chromium build that matches the locked Playwright
# version (headless shell only: the grader runs headless) and its libraries.
COPY package.json package-lock.json ./
RUN set -eux; \
    npm ci --no-audit --no-fund; \
    npx playwright install --with-deps --only-shell chromium; \
    rm -rf /var/lib/apt/lists/* /root/.npm /tmp/*

COPY tsconfig.json ./
COPY src ./src
COPY service ./service

# Never run the browser as root: Chromium's sandbox needs a normal user.
USER node
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

# tsx as a loader in a single node process, so SIGTERM reaches the server
# directly and it can finish the grade in flight.
CMD ["node", "--import", "tsx", "service/server.ts"]
