import type { LegalDocument } from "@codesphere/contract";

export const LANGUAGES = ["fr", "en"] as const;
export type Language = (typeof LANGUAGES)[number];
export type Selection = { document: LegalDocument; language: Language };
