"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import {
	DATA_SAVER_COOKIE,
	DATA_SAVER_PREFERENCES,
	type DataSaverPreference,
} from "./data-saver";

/** Stores the choice in a cookie and re-renders the server tree with it. "auto" removes the cookie. */
export async function setDataSaver(value: DataSaverPreference) {
	if (!DATA_SAVER_PREFERENCES.includes(value)) {
		return;
	}
	const cookieStore = await cookies();
	if (value === "auto") {
		cookieStore.delete(DATA_SAVER_COOKIE);
	} else {
		cookieStore.set(DATA_SAVER_COOKIE, value, {
			path: "/",
			maxAge: 60 * 60 * 24 * 365,
			sameSite: "lax",
		});
	}
	revalidatePath("/", "layout");
}
