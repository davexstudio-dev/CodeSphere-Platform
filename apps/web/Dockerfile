FROM oven/bun:1 AS builder
WORKDIR /app

COPY . .
RUN --mount=type=secret,id=web_env,target=/app/apps/web/.env.local --mount=type=secret,id=server_env,target=/app/apps/server/.env.local --mount=type=cache,target=/root/.bun/install/cache bun install

ARG NEXT_PUBLIC_SERVER_URL
ENV NEXT_PUBLIC_SERVER_URL=${NEXT_PUBLIC_SERVER_URL}
# With NEXT_PUBLIC_SERVER_URL empty (same origin, production), server code builds the API URL from
# SERVER_URL, and `next build` evaluates it while collecting page data: an empty base is an
# Invalid URL. Same internal address as docker-compose.prod.yml; read at runtime, never inlined,
# and only in this stage.
ARG SERVER_URL=http://server:3000
ENV SERVER_URL=${SERVER_URL}
# Shows the email sign-in code field; inlined at build time, must match EMAIL_OTP_SIGNIN on the
# server (docker-compose.prod.yml).
ARG NEXT_PUBLIC_EMAIL_OTP_SIGNIN=false
ENV NEXT_PUBLIC_EMAIL_OTP_SIGNIN=${NEXT_PUBLIC_EMAIL_OTP_SIGNIN}
# Footer build identity (#42): .git is excluded from the context, so the build args carry the values.
# No defaults here: an unset arg lets next.config.ts fall back to package.json and git.
ARG APP_VERSION
ARG GIT_SHA
ENV NODE_ENV=production
RUN --mount=type=secret,id=web_env,target=/app/apps/web/.env.local --mount=type=secret,id=server_env,target=/app/apps/server/.env.local cd apps/web && bun run build

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder --chown=bun:bun /app /app

# Not root: Next writes its cache under .next at runtime, owned by bun above.
USER bun
ENV HOST=0.0.0.0
ENV PORT=3001
EXPOSE 3001

WORKDIR /app/apps/web
CMD ["bun", "--bun", "run", "start", "--hostname", "0.0.0.0", "--port", "3001"]
