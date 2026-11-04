// Imported first by worker.ts, so `fetch` is replaced before OpenNext and Next.js capture it.
import { isApiPath } from "server/worker";

import { installSelfFetch } from "./self-fetch";

installSelfFetch(isApiPath);
