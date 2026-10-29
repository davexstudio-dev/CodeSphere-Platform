import type { Database } from "@codesphere/db";
import {
	JOB_DURATION_DAYS,
	jobApplications,
	jobPostings,
	jobReports,
} from "@codesphere/db/schema/jobs";
import { organization } from "@codesphere/db/schema/organizations";
import { watchItems, watchSources } from "@codesphere/db/schema/watch";
import { inArray, sql } from "drizzle-orm";

// Demo Job postings and Watch feed (#291). Fixed ids, so a replay upserts instead of duplicating.

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

export const DEMO_ORG_ID = "00000000-0000-4000-8000-0000000d0001";

const demoOrganization = {
	id: DEMO_ORG_ID,
	slug: "kora-tech-demo",
	name: "Kora Tech",
	website: "https://kora-tech.example",
	description:
		"Studio produit à Abidjan et Dakar : paiements mobiles et outils pour les PME.",
	country: "CI",
	status: "validated" as const,
	ownerId: "demo-aicha",
	validatedAt: daysAgo(40),
	system: true,
};

type DemoJob = {
	id: string;
	title: string;
	description: string;
	tags: string[];
	country: string;
	remote: boolean;
	publishedDaysAgo: number;
	status?: "removed";
	removedReason?: string;
};

export const demoJobs: DemoJob[] = [
	{
		id: "00000000-0000-4000-8000-0000000a0001",
		title: "Développeuse ou développeur React Native",
		description:
			"Application de paiement Mobile Money utilisée dans 4 pays. Stack : React Native, TypeScript, Expo.",
		tags: ["react-native", "typescript"],
		country: "CI",
		remote: true,
		publishedDaysAgo: 2,
	},
	{
		id: "00000000-0000-4000-8000-0000000a0002",
		title: "Ingénieur·e backend Node.js",
		description:
			"API de rapprochement des paiements, Postgres et files de messages. Équipe de 6 personnes.",
		tags: ["nodejs", "postgresql"],
		country: "SN",
		remote: false,
		publishedDaysAgo: 5,
	},
	{
		id: "00000000-0000-4000-8000-0000000a0003",
		title: "Data analyst (stage 6 mois)",
		description:
			"Tableaux de bord sur l'usage des agents et la fraude. Python, SQL, notions de statistiques.",
		tags: ["python", "sql"],
		country: "CI",
		remote: false,
		publishedDaysAgo: 9,
	},
	{
		id: "00000000-0000-4000-8000-0000000a0004",
		title: "Gagnez 5 000 € par semaine sans expérience",
		description:
			"Contactez-nous vite sur WhatsApp pour une opportunité unique.",
		tags: ["javascript"],
		country: "OTHER",
		remote: true,
		publishedDaysAgo: 1,
	},
	{
		id: "00000000-0000-4000-8000-0000000a0005",
		title: "Développeur PHP freelance (offre retirée)",
		description: "Mission de maintenance d'un site vitrine.",
		tags: ["php"],
		country: "CM",
		remote: true,
		publishedDaysAgo: 12,
		status: "removed",
		removedReason: "Offre en double, retirée après signalement.",
	},
	{
		id: "00000000-0000-4000-8000-0000000a0006",
		title: "Lead DevOps Kubernetes",
		description: "Migration vers Kubernetes et supervision. L'offre a expiré.",
		tags: ["devops", "kubernetes"],
		country: "SN",
		remote: true,
		publishedDaysAgo: JOB_DURATION_DAYS + 5,
	},
];

// The suspicious posting waits for an Admin; the removed one was upheld.
const demoReports = [
	{
		userId: "demo-koffi",
		jobId: "00000000-0000-4000-8000-0000000a0004",
		reason: "Ressemble à une arnaque.",
		outcome: null,
	},
	{
		userId: "demo-mariam",
		jobId: "00000000-0000-4000-8000-0000000a0005",
		reason: "Offre publiée deux fois.",
		outcome: "upheld" as const,
	},
];

const demoApplications = [
	{
		userId: "demo-yannick",
		jobId: "00000000-0000-4000-8000-0000000a0001",
		sharedCard: true,
	},
	{
		userId: "demo-grace",
		jobId: "00000000-0000-4000-8000-0000000a0001",
		sharedCard: false,
	},
	{
		userId: "demo-ibrahim",
		jobId: "00000000-0000-4000-8000-0000000a0002",
		sharedCard: true,
	},
];

export const demoSources = [
	{
		id: "00000000-0000-4000-8000-0000000b0001",
		name: "TechCabal",
		feedUrl: "https://techcabal.example/feed",
		domain: "techcabal.example",
		language: "en" as const,
		african: true,
		tags: ["startups"],
	},
	{
		id: "00000000-0000-4000-8000-0000000b0002",
		name: "Journal du Code",
		feedUrl: "https://journal-du-code.example/rss",
		domain: "journal-du-code.example",
		language: "fr" as const,
		african: false,
		tags: ["javascript"],
	},
	{
		id: "00000000-0000-4000-8000-0000000b0003",
		name: "Dakar Dev Blog",
		feedUrl: "https://dakar-dev.example/atom.xml",
		domain: "dakar-dev.example",
		language: "fr" as const,
		african: true,
		tags: ["mobile"],
		active: false,
	},
];

type DemoItem = {
	n: number;
	title: string;
	summary: string;
	tags: string[];
	sourceIndex?: number;
	submitterId?: string;
	visibility: "visible" | "pending" | "removed";
	removedReason?: string;
};

const items: DemoItem[] = [
	{
		n: 1,
		title: "Les paiements mobiles dépassent les cartes en Afrique de l'Ouest",
		summary:
			"Panorama des volumes Mobile Money en 2026 et de ce qu'ils changent pour les API.",
		tags: ["mobile-money"],
		sourceIndex: 0,
		visibility: "visible",
	},
	{
		n: 2,
		title: "TypeScript 6 : ce qui change pour vos projets",
		summary: "Les nouveautés du compilateur et comment migrer sans casse.",
		tags: ["typescript"],
		sourceIndex: 1,
		visibility: "visible",
	},
	{
		n: 3,
		title: "Construire hors ligne d'abord avec React Native",
		summary:
			"Stocker, synchroniser et résoudre les conflits quand le réseau manque.",
		tags: ["react-native"],
		sourceIndex: 2,
		visibility: "visible",
	},
	{
		n: 4,
		title: "Une levée de fonds record pour une fintech de Lagos",
		summary: "Ce que l'opération dit de la maturité de l'écosystème.",
		tags: ["startups"],
		sourceIndex: 0,
		visibility: "visible",
	},
	{
		n: 5,
		title: "Indexer Postgres pour les recherches en français",
		summary:
			"Dictionnaires, accents et unaccent : une configuration qui tient la charge.",
		tags: ["postgresql"],
		submitterId: "demo-ibrahim",
		visibility: "visible",
	},
	{
		n: 6,
		title: "Guide : USSD et API dans la même application",
		summary:
			"Servir les téléphones simples et les smartphones avec un seul backend.",
		tags: ["ussd"],
		submitterId: "demo-aicha",
		visibility: "pending",
	},
	{
		n: 7,
		title: "Retour d'expérience : Kubernetes sur un petit budget",
		summary: "Ce qu'une équipe de trois a gardé, et ce qu'elle a abandonné.",
		tags: ["kubernetes"],
		submitterId: "demo-koffi",
		visibility: "pending",
	},
	{
		n: 8,
		title: "Téléchargez des cours payants gratuitement",
		summary: "Lien promotionnel.",
		tags: ["javascript"],
		submitterId: "demo-grace",
		visibility: "removed",
		removedReason: "Contenu piraté.",
	},
	{
		n: 9,
		title: "Accessibilité : tester avec un lecteur d'écran en 10 minutes",
		summary:
			"Une routine courte pour attraper les erreurs les plus fréquentes.",
		tags: ["accessibility"],
		sourceIndex: 1,
		visibility: "visible",
	},
];

export const demoItems = items.map((item) => {
	const source =
		item.sourceIndex === undefined ? undefined : demoSources[item.sourceIndex];
	const domain = source?.domain ?? "blog.example";
	const slug = `demo-${item.n}`;
	return {
		id: `00000000-0000-4000-8000-0000000c000${item.n}`,
		url: `https://${domain}/${slug}`,
		urlKey: `${domain}/${slug}`,
		domain,
		title: item.title,
		summary: item.summary,
		tags: item.tags,
		language: source?.language ?? ("fr" as const),
		africanSource: source?.african ?? false,
		sourceId: source?.id ?? null,
		submitterId: item.submitterId ?? null,
		visibility: item.visibility,
		removedReason: item.removedReason ?? null,
		publishedAt: daysAgo(item.n),
	};
});

/** Loads the demo Organization, Job postings and Watch feed; a replay updates them in place. */
export async function seedDemoJobsWatch(db: Database) {
	await db
		.insert(organization)
		.values(demoOrganization)
		.onConflictDoUpdate({
			target: organization.id,
			set: { name: sql`excluded.name`, status: sql`excluded.status` },
		});

	await db
		.insert(jobPostings)
		.values(
			demoJobs.map((job) => {
				const publishedAt = daysAgo(job.publishedDaysAgo);
				return {
					id: job.id,
					organizationId: DEMO_ORG_ID,
					createdBy: demoOrganization.ownerId,
					title: job.title,
					description: job.description,
					tags: job.tags,
					country: job.country,
					remote: job.remote,
					applyUrl: "https://kora-tech.example/careers",
					status: job.status ?? ("published" as const),
					removedReason: job.removedReason ?? null,
					publishedAt,
					expiresAt: new Date(publishedAt.getTime() + JOB_DURATION_DAYS * DAY),
				};
			}),
		)
		.onConflictDoUpdate({
			target: jobPostings.id,
			set: {
				title: sql`excluded.title`,
				description: sql`excluded.description`,
				status: sql`excluded.status`,
				removedReason: sql`excluded.removed_reason`,
				publishedAt: sql`excluded.published_at`,
				expiresAt: sql`excluded.expires_at`,
			},
		});
	await db.insert(jobReports).values(demoReports).onConflictDoNothing();
	await db
		.insert(jobApplications)
		.values(demoApplications)
		.onConflictDoNothing();

	await db
		.insert(watchSources)
		.values(demoSources.map((s) => ({ active: true, ...s })))
		.onConflictDoUpdate({
			target: watchSources.id,
			set: { name: sql`excluded.name`, active: sql`excluded.active` },
		});
	await db
		.insert(watchItems)
		.values(demoItems)
		.onConflictDoUpdate({
			target: watchItems.id,
			set: {
				title: sql`excluded.title`,
				summary: sql`excluded.summary`,
				visibility: sql`excluded.visibility`,
				removedReason: sql`excluded.removed_reason`,
				publishedAt: sql`excluded.published_at`,
			},
		});

	return {
		jobs: demoJobs.length,
		applications: demoApplications.length,
		reports: demoReports.length,
		sources: demoSources.length,
		items: demoItems.length,
	};
}

/** Removes everything `seedDemoJobsWatch` loaded (`--reset`), children first. */
export async function resetDemoJobsWatch(db: Database) {
	const jobIds = demoJobs.map((j) => j.id);
	await db.delete(jobReports).where(inArray(jobReports.jobId, jobIds));
	await db
		.delete(jobApplications)
		.where(inArray(jobApplications.jobId, jobIds));
	await db.delete(jobPostings).where(inArray(jobPostings.id, jobIds));
	await db.delete(organization).where(inArray(organization.id, [DEMO_ORG_ID]));
	await db.delete(watchItems).where(
		inArray(
			watchItems.id,
			demoItems.map((i) => i.id),
		),
	);
	await db.delete(watchSources).where(
		inArray(
			watchSources.id,
			demoSources.map((s) => s.id),
		),
	);
}
