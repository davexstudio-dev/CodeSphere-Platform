# Modular monolith first, services extracted on a trigger

CodeSphere stays a modular monolith: each module exposes only its contract and never reads another module's tables, checked by a lint rule. A module becomes a separate service only when a trigger holds (it needs another runtime, must scale or fail on its own, or has its own team), in the order search, feed ingestion, payments, notifications. We chose this over microservices from the start because a small team cannot afford several deployments, network hops and distributed transactions before the traffic justifies them, and clean module boundaries make a later extraction mechanical.

## Consequences

- The edge acts as the API gateway: Cloudflare in front (firewall, rate limiting, cache) and the Hono app as the single `/api/v1` entry point (authentication, per-Member and per-Agent quotas in a shared store). A dedicated gateway appears only when several services must share one domain.
- Events leave the monolith through an outbox table drained into Cloudflare Queues, with idempotent consumers, because the edge database has no interactive transactions.
- One Postgres with one schema per module; an extracted service gets its own schema, then its own database if needed.
