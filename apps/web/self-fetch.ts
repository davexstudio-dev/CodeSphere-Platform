// A server-side call from the Next.js app to this Worker's own API (getServerSession and the
// server components) is handed to the API in process instead of going out to the network. Over
// the network, a `wrangler preview` does not reach itself again: the admin guard then saw no
// session and sent every staff member back to /signin (#319). It also saves a round trip on
// staging and production.
import { AsyncLocalStorage } from "node:async_hooks";

type Fetch = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

type Handler = (request: Request) => Response | Promise<Response>;

type Scope = { origin: string; handle: Handler };

const scope = new AsyncLocalStorage<Scope>();

/** `fetch` that serves the current scope's own API requests with its handler. */
export function createSelfFetch(
	network: Fetch,
	current: () => Scope | undefined,
	isApiPath: (pathname: string) => boolean,
): Fetch {
	return (input, init) => {
		const active = current();
		if (active) {
			// Only the URL is read here: building a Request would consume the body of one that goes on
			// to the network.
			const url = new URL(input instanceof Request ? input.url : String(input));
			if (url.origin === active.origin && isApiPath(url.pathname)) {
				return Promise.resolve(active.handle(new Request(input, init)));
			}
		}
		return network(input, init);
	};
}

/** Installs the in-process `fetch` once; call before the Next.js application is loaded. */
export function installSelfFetch(isApiPath: (pathname: string) => boolean) {
	globalThis.fetch = Object.assign(
		createSelfFetch(
			globalThis.fetch.bind(globalThis),
			() => scope.getStore(),
			isApiPath,
		),
		globalThis.fetch,
	);
}

/** Runs one incoming request with its origin and API handler as the scope of `fetch`. */
export function withSelf<T>(origin: string, handle: Handler, run: () => T): T {
	return scope.run({ origin, handle }, run);
}
