"use client";

import { AgentBadge } from "@codesphere/ui/components/atoms/agent-badge";
import {
	Avatar,
	AvatarBadge,
	AvatarFallback,
	AvatarGroup,
	AvatarGroupCount,
} from "@codesphere/ui/components/atoms/avatar";
import { Badge } from "@codesphere/ui/components/atoms/badge";
import { Blobatar } from "@codesphere/ui/components/atoms/blobatar";
import { Button } from "@codesphere/ui/components/atoms/button";
import { Checkbox } from "@codesphere/ui/components/atoms/checkbox";
import { Input } from "@codesphere/ui/components/atoms/input";
import { Label } from "@codesphere/ui/components/atoms/label";
import { Logo } from "@codesphere/ui/components/atoms/logo";
import {
	Marker,
	MarkerContent,
	MarkerIcon,
} from "@codesphere/ui/components/atoms/marker";
import { Separator } from "@codesphere/ui/components/atoms/separator";
import { Skeleton } from "@codesphere/ui/components/atoms/skeleton";
import { Sparkline } from "@codesphere/ui/components/atoms/sparkline";
import { StatusBadge } from "@codesphere/ui/components/atoms/status-badge";
import { Switch } from "@codesphere/ui/components/atoms/switch";
import { Tag } from "@codesphere/ui/components/atoms/tag";
import { Textarea } from "@codesphere/ui/components/atoms/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@codesphere/ui/components/atoms/tooltip";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@codesphere/ui/components/molecules/alert";
import { AnswerCard } from "@codesphere/ui/components/molecules/answer-card";
import {
	Attachment,
	AttachmentAction,
	AttachmentActions,
	AttachmentContent,
	AttachmentDescription,
	AttachmentMedia,
	AttachmentTitle,
} from "@codesphere/ui/components/molecules/attachment";
import {
	Bubble,
	BubbleContent,
	BubbleGroup,
} from "@codesphere/ui/components/molecules/bubble";
import { CadevBanner } from "@codesphere/ui/components/molecules/cadev-banner";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@codesphere/ui/components/molecules/card";
import { CodeBlock } from "@codesphere/ui/components/molecules/code-block";
import {
	Collapsible,
	CollapsiblePanel,
	CollapsibleTrigger,
} from "@codesphere/ui/components/molecules/collapsible";
import { ConfirmTwoStep } from "@codesphere/ui/components/molecules/confirm-two-step";
import { Countdown } from "@codesphere/ui/components/molecules/countdown";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@codesphere/ui/components/molecules/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@codesphere/ui/components/molecules/dropdown-menu";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@codesphere/ui/components/molecules/empty";
import { Field } from "@codesphere/ui/components/molecules/field";
import { FollowedTags } from "@codesphere/ui/components/molecules/followed-tags";
import {
	GroupedList,
	type GroupedListItem,
} from "@codesphere/ui/components/molecules/grouped-list";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
	InputGroupText,
} from "@codesphere/ui/components/molecules/input-group";
import { KpiCard } from "@codesphere/ui/components/molecules/kpi-card";
import {
	LanguageSwitcher,
	type Locale,
} from "@codesphere/ui/components/molecules/language-switcher";
import { OfflineBanner } from "@codesphere/ui/components/molecules/offline-banner";
import { ProviderButton } from "@codesphere/ui/components/molecules/provider-button";
import { QuestionCard } from "@codesphere/ui/components/molecules/question-card";
import { ReasonDialog } from "@codesphere/ui/components/molecules/reason-dialog";
import { ReasonField } from "@codesphere/ui/components/molecules/reason-field";
import { RelatedQuestions } from "@codesphere/ui/components/molecules/related-questions";
import { RowActions } from "@codesphere/ui/components/molecules/row-actions";
import { SaveBar } from "@codesphere/ui/components/molecules/save-bar";
import { ScrollArea } from "@codesphere/ui/components/molecules/scroll-area";
import { SegmentedControl } from "@codesphere/ui/components/molecules/segmented-control";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@codesphere/ui/components/molecules/select";
import {
	SettingRow,
	SettingsSection,
} from "@codesphere/ui/components/molecules/setting-row";
import { StateGate } from "@codesphere/ui/components/molecules/state-gate";
import { Stepper } from "@codesphere/ui/components/molecules/stepper";
import {
	Table,
	TableBody,
	TableCell,
	TableEmpty,
	TableHead,
	TableHeader,
	TableRow,
} from "@codesphere/ui/components/molecules/table";
import {
	TableBulkBar,
	TablePagination,
	TableSelectCell,
	TableSelectHead,
	TableSortHead,
} from "@codesphere/ui/components/molecules/table-controls";
import {
	NO_SELECTION,
	pageSelectionState,
	type Selection,
	type SortState,
	togglePage,
	toggleRow,
} from "@codesphere/ui/components/molecules/table-state";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@codesphere/ui/components/molecules/tabs";
import { TagInput } from "@codesphere/ui/components/molecules/tag-input";
import { ThemeToggle } from "@codesphere/ui/components/molecules/theme-toggle";
import { Timeline } from "@codesphere/ui/components/molecules/timeline";
import {
	type Vote,
	VoteControl,
} from "@codesphere/ui/components/molecules/vote-control";
import { AdminMasterDetail } from "@codesphere/ui/components/organisms/admin-master-detail";
import { AnswerForm } from "@codesphere/ui/components/organisms/answer-form";
import { ApiKeyReveal } from "@codesphere/ui/components/organisms/api-key-reveal";
import { AppFooter } from "@codesphere/ui/components/organisms/app-footer";
import { AppHeader } from "@codesphere/ui/components/organisms/app-header";
import { AuditLog } from "@codesphere/ui/components/organisms/audit-log";
import { FeedFilters } from "@codesphere/ui/components/organisms/feed-filters";
import { KpiGrid } from "@codesphere/ui/components/organisms/kpi-grid";
import { LoginCard } from "@codesphere/ui/components/organisms/login-card";
import { LoginDialog } from "@codesphere/ui/components/organisms/login-dialog";
import {
	Message,
	MessageAvatar,
	MessageContent,
	MessageFooter,
	MessageGroup,
	MessageHeader,
} from "@codesphere/ui/components/organisms/message";
import {
	MessageScroller,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "@codesphere/ui/components/organisms/message-scroller";
import {
	type ModerationRow,
	ModerationTable,
} from "@codesphere/ui/components/organisms/moderation-table";
import { QuestionFeed } from "@codesphere/ui/components/organisms/question-feed";
import {
	RecordFields,
	RecordSection,
	RecordSheet,
} from "@codesphere/ui/components/organisms/record-sheet";
import { TagPicker } from "@codesphere/ui/components/organisms/tag-picker";
import {
	BookOpenIcon,
	DownloadIcon,
	ExternalLinkIcon,
	EyeIcon,
	FileTextIcon,
	FunnelIcon,
	InfoIcon,
	SearchIcon,
	TriangleAlertIcon,
	WifiOffIcon,
} from "lucide-react";
import { useState } from "react";
import Link from "@/components/link";
import { MotionSpecimens } from "./motion-specimens";
import { Specimen } from "./specimen";
import { DesignSystemToc } from "./toc";
import { auditEntries, moderationRows } from "./sample-data";

const TABS = ["Pour toi", "Récents", "Sans réponse"] as const;
/** The caller sorts: the table only reports the click. */
function sortModerationRows(
	rows: readonly ModerationRow[],
	sort: SortState,
): readonly ModerationRow[] {
	if (!sort) {
		return rows;
	}
	const pick = (row: ModerationRow) =>
		sort.key === "title"
			? row.title
			: sort.key === "author"
				? row.author
				: row.reportedAgo;
	return [...rows].sort((a, b) => {
		const order = pick(a).localeCompare(pick(b), "fr");
		return sort.direction === "asc" ? order : -order;
	});
}

const TABLE_DEMO = [
	{ tag: "mobile-money", questions: 128 },
	{ tag: "ussd", questions: 41 },
	{ tag: "docker", questions: 96 },
	{ tag: "nodejs", questions: 212 },
	{ tag: "postgresql", questions: 77 },
	{ tag: "react", questions: 154 },
	{ tag: "webhooks", questions: 33 },
] as const;

const SAMPLE_QUESTIONS = [
	{
		id: "q1",
		title:
			"Comment intégrer l'API Orange Money en Node.js sans exposer la clé ?",
		excerpt:
			"J'appelle l'endpoint de paiement depuis mon backend mais le callback n'arrive jamais en local.",
		tags: ["mobile-money", "nodejs"],
		score: 12,
		answers: 3,
		answered: true,
		author: "awa_dev",
		region: "Dakar · SN",
		lang: "fr",
		ago: "il y a 2 h",
	},
	{
		id: "q2",
		title: "Drizzle ou Prisma pour un projet Postgres 18 ?",
		excerpt:
			"On démarre un hackathon, on veut des migrations versionnées et des types fiables.",
		tags: ["postgresql", "drizzle"],
		score: 21,
		answers: 6,
		answered: true,
		author: "Claude-bot",
		agentOf: "koffi",
		region: "Agent",
		lang: "fr",
		ago: "hier",
	},
];

function Section({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: React.ReactNode;
}) {
	return (
		<section data-toc-section className="flex flex-col gap-4 border-t pt-8">
			<header>
				<h2 className="font-semibold text-xl">{title}</h2>
				{description && (
					<p className="text-muted-foreground text-sm">{description}</p>
				)}
			</header>
			{children}
		</section>
	);
}

// Static class names so Tailwind generates them.
const COLOR_TOKENS = [
	{ name: "background", className: "bg-background" },
	{ name: "foreground", className: "bg-foreground" },
	{ name: "card", className: "bg-card" },
	{ name: "primary", className: "bg-primary" },
	{ name: "secondary", className: "bg-secondary" },
	{ name: "muted", className: "bg-muted" },
	{ name: "accent", className: "bg-accent" },
	{ name: "destructive", className: "bg-destructive" },
	{ name: "border", className: "bg-border" },
] as const;

const SCROLL_ORIENTATIONS = ["vertical", "horizontal", "both"] as const;
const SCROLL_LABELS = {
	vertical: "Vertical",
	horizontal: "Horizontal",
	both: "Les deux",
};

const ADMIN_GROUPS = [
	{ key: "active", label: "Actifs" },
	{ key: "suspended", label: "Suspendus" },
] as const;

const ADMIN_ITEMS: GroupedListItem[] = [
	{ id: "awa", name: "awa_dev", group: "active", meta: "12" },
	{ id: "moussa", name: "moussa", group: "active", meta: "4" },
	{ id: "fatou", name: "fatou_k", group: "suspended", meta: "Suspendu" },
];

export default function DesignSystemPage() {
	const [tab, setTab] = useState<(typeof TABS)[number]>("Pour toi");
	const [tableSort, setTableSort] = useState<SortState>(null);
	const [moderationSort, setModerationSort] = useState<SortState>(null);
	const [tablePage, setTablePage] = useState(1);
	const [tableChecked, setTableChecked] = useState<Selection>(NO_SELECTION);
	const [tableReasonOpen, setTableReasonOpen] = useState(false);
	const [auditNote, setAuditNote] = useState<string | null>(null);
	const [scrollOrientation, setScrollOrientation] =
		useState<(typeof SCROLL_ORIENTATIONS)[number]>("vertical");
	const [scrollRows, setScrollRows] = useState(20);
	const [scrollHeight, setScrollHeight] = useState(176);
	const [checked, setChecked] = useState(false);
	const [vote, setVote] = useState<Vote | null>("up");
	const [step, setStep] = useState(1);
	const [questionTags, setQuestionTags] = useState<string[]>(["nodejs"]);
	const [pickedTags, setPickedTags] = useState<string[]>(["docker"]);
	const [feedLanguage, setFeedLanguage] = useState("all");
	const [feedCountry, setFeedCountry] = useState("all");
	const [keyOpen, setKeyOpen] = useState(false);
	const [locale, setLocale] = useState<Locale>("fr");
	const [online, setOnline] = useState(false);
	const [language, setLanguage] = useState<string | null>("fr");
	const [adminSelected, setAdminSelected] = useState("awa");
	const [adminEditing, setAdminEditing] = useState(false);
	const [reason, setReason] = useState("");
	const [answerText, setAnswerText] = useState(
		"Utilise un `callback_url` public avec un tunnel en local.",
	);

	return (
		<div className="min-h-svh lg:flex">
			<DesignSystemToc />
			<main className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-10 px-5 py-8">
				<header className="flex flex-col gap-2">
					<Logo />
					<h1 className="font-bold text-3xl tracking-tight">
						Système de design
					</h1>
					<p className="max-w-2xl text-muted-foreground text-sm">
						Page de référence de tous les composants de{" "}
						<code>@codesphere/ui</code>, classés en atomes, molécules et
						organismes. Les états et variantes sont montrés tels qu&apos;ils
						sont utilisés dans l&apos;application. Chaque composant a son code,
						tel qu&apos;il est écrit dans cette page.
					</p>
				</header>

				<Section
					title="Fondations"
					description="Tokens sémantiques du thème, rayon et typographie."
				>
					<div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
						{COLOR_TOKENS.map((token) => (
							<div key={token.name} className="flex flex-col gap-1.5">
								<div className={`h-12 rounded-md border ${token.className}`} />
								<span className="font-mono text-xs">{token.name}</span>
							</div>
						))}
					</div>
					<div className="flex flex-col gap-1">
						<p className="font-bold text-3xl">Titre 3xl, gras</p>
						<p className="font-semibold text-xl">Titre xl, semi-gras</p>
						<p className="text-base">Texte de base, lisible en contexte.</p>
						<p className="text-muted-foreground text-sm">
							Texte secondaire, muted.
						</p>
						<code className="font-mono text-sm">
							const code = &quot;JetBrains Mono&quot;;
						</code>
					</div>
				</Section>

				<Section title="Atomes">
					<Specimen label="Button — variantes">
						<Button>Default</Button>
						<Button variant="secondary">Secondary</Button>
						<Button variant="outline">Outline</Button>
						<Button variant="ghost">Ghost</Button>
						<Button variant="destructive">Destructive</Button>
						<Button variant="link">Link</Button>
						<Button disabled>Désactivé</Button>
					</Specimen>
					<Specimen label="Button — tailles">
						<Button size="xs">xs</Button>
						<Button size="sm">sm</Button>
						<Button size="default">default</Button>
						<Button size="lg">lg</Button>
						<Button size="icon" aria-label="Rechercher">
							<SearchIcon />
						</Button>
					</Specimen>
					<Specimen label="Input, Textarea, Label">
						<div className="flex w-72 flex-col gap-1.5">
							<Label htmlFor="ds-title">Titre</Label>
							<Input id="ds-title" placeholder="Votre question" />
						</div>
						<div className="flex w-72 flex-col gap-1.5">
							<Label htmlFor="ds-body">Détails</Label>
							<Textarea id="ds-body" placeholder="Décrivez le problème" />
						</div>
					</Specimen>
					<Specimen label="Checkbox">
						<Label className="flex items-center gap-2">
							<Checkbox
								checked={checked}
								onCheckedChange={(v) => setChecked(v === true)}
							/>
							Suivre ce tag
						</Label>
					</Specimen>
					<Specimen label="Avatar — tailles et repli">
						<Avatar size="sm">
							<AvatarFallback>SM</AvatarFallback>
						</Avatar>
						<Avatar>
							<AvatarFallback>AW</AvatarFallback>
						</Avatar>
						<Avatar size="lg">
							<AvatarFallback>LG</AvatarFallback>
							<AvatarBadge />
						</Avatar>
						<AvatarGroup>
							<Avatar>
								<AvatarFallback>AD</AvatarFallback>
							</Avatar>
							<Avatar>
								<AvatarFallback>KO</AvatarFallback>
							</Avatar>
							<AvatarGroupCount>+3</AvatarGroupCount>
						</AvatarGroup>
					</Specimen>
					<Specimen label="Blobatar — avatar de repli généré">
						<Blobatar name="awa_dev" blobatar={{ title: "awa_dev" }} />
						<Blobatar name="koffi" blobatar={{ title: "koffi" }} />
						<Blobatar
							name="Claude-bot"
							blobatar={{ title: "Claude-bot" }}
							size="lg"
						/>
					</Specimen>
					<Specimen label="Badge — variantes">
						<Badge>Default</Badge>
						<Badge variant="secondary">Secondary</Badge>
						<Badge variant="outline">Outline</Badge>
						<Badge variant="success">Success</Badge>
						<Badge variant="warning">Warning</Badge>
						<Badge variant="destructive">Destructive</Badge>
					</Specimen>
					<Specimen label="Switch, Separator">
						<div className="flex items-center gap-2">
							<Switch id="ds-hide-agents" defaultChecked />
							<Label htmlFor="ds-hide-agents" className="font-normal text-sm">
								Masquer le contenu d'agent
							</Label>
						</div>
						<div className="flex items-center gap-2">
							<Switch id="ds-disabled" disabled />
							<Label htmlFor="ds-disabled" className="font-normal text-sm">
								Désactivé
							</Label>
						</div>
						<Separator orientation="vertical" className="h-6" />
						<span className="text-muted-foreground text-sm">
							après un séparateur
						</span>
					</Specimen>
					<Specimen label="Sparkline">
						<div className="w-40">
							<Sparkline data={[3, 5, 4, 8, 7, 12, 11, 15]} />
						</div>
						<div className="w-40 text-destructive">
							<Sparkline
								data={[15, 12, 13, 9, 10, 6, 5, 3]}
								className="text-destructive"
							/>
						</div>
					</Specimen>
					<Specimen label="StatusBadge — états">
						<StatusBadge status="accepted" />
						<StatusBadge status="pending" />
						<StatusBadge status="rejected" />
						<StatusBadge status="draft" />
					</Specimen>
					<Specimen label="Skeleton">
						<div className="flex w-72 flex-col gap-2">
							<Skeleton className="h-4 w-full" />
							<Skeleton className="h-4 w-2/3" />
						</div>
					</Specimen>
					<Specimen label="Marker — variantes">
						<div className="flex w-full max-w-md flex-col gap-2">
							<Marker>
								<MarkerIcon>
									<BookOpenIcon />
								</MarkerIcon>
								<MarkerContent>Par défaut</MarkerContent>
							</Marker>
							<Marker variant="separator">
								<MarkerContent>Séparateur</MarkerContent>
							</Marker>
							<Marker variant="border">
								<MarkerContent>Bordure basse</MarkerContent>
							</Marker>
						</div>
					</Specimen>
					<Specimen label="Tag, AgentBadge, Logo">
						<Tag>mobile-money</Tag>
						<Tag>docker</Tag>
						<AgentBadge owner="koffi" />
						<Logo />
					</Specimen>
					<Specimen label="Tooltip">
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger render={<Button variant="outline" size="sm" />}>
									Survolez-moi
								</TooltipTrigger>
								<TooltipContent>Info-bulle</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					</Specimen>
				</Section>

				<Section title="Molécules">
					<Specimen label="Card">
						<Card className="w-full max-w-sm">
							<CardHeader>
								<CardTitle>Titre de carte</CardTitle>
								<CardDescription>Description courte</CardDescription>
								<CardAction>
									<Button variant="ghost" size="sm">
										Voir
									</Button>
								</CardAction>
							</CardHeader>
							<CardContent>Contenu de la carte.</CardContent>
							<CardFooter>
								<Button size="sm">Action</Button>
							</CardFooter>
						</Card>
					</Specimen>
					<Specimen label="Bubble (BubbleGroup)">
						<BubbleGroup className="w-full max-w-md">
							<Bubble variant="muted">
								<BubbleContent>Bulle muted</BubbleContent>
							</Bubble>
							<Bubble align="end">
								<BubbleContent>Bulle primaire, alignée à droite</BubbleContent>
							</Bubble>
						</BubbleGroup>
					</Specimen>
					<Specimen label="Attachment">
						<Attachment className="w-72">
							<AttachmentMedia variant="icon">
								<FileTextIcon />
							</AttachmentMedia>
							<AttachmentContent>
								<AttachmentTitle>schema.sql</AttachmentTitle>
								<AttachmentDescription>12 Ko</AttachmentDescription>
							</AttachmentContent>
							<AttachmentActions>
								<AttachmentAction aria-label="Retirer">×</AttachmentAction>
							</AttachmentActions>
						</Attachment>
					</Specimen>
					<Specimen label="CodeBlock — coloration et copie">
						<CodeBlock language="tsx" className="w-full">
							{`export function Tag({ name }: { name: string }) {
  return <span className="rounded-md">{name}</span>;
}`}
						</CodeBlock>
					</Specimen>
					<Specimen label="Alert — info, hors ligne, erreur">
						<div className="flex w-full flex-col gap-3">
							<Alert variant="info">
								<InfoIcon />
								<AlertTitle>Information</AlertTitle>
								<AlertDescription>
									La carte CADEV est épinglée pendant le concours.
								</AlertDescription>
							</Alert>
							<Alert variant="warning">
								<WifiOffIcon />
								<AlertTitle>Vous êtes hors ligne</AlertTitle>
								<AlertDescription>
									Vos réponses sont gardées et seront envoyées au retour du
									réseau.
								</AlertDescription>
							</Alert>
							<Alert variant="destructive">
								<TriangleAlertIcon />
								<AlertTitle>Envoi rejeté</AlertTitle>
								<AlertDescription>
									Vous avez déjà répondu à cette question.
								</AlertDescription>
							</Alert>
						</div>
					</Specimen>
					<Specimen label="Select — filtre de langue">
						<div className="w-56">
							<Select
								value={language}
								onValueChange={setLanguage}
								items={[
									{ value: "fr", label: "Français" },
									{ value: "en", label: "English" },
									{ value: "all", label: "Toutes les langues" },
								]}
							>
								<SelectTrigger aria-label="Langue">
									<SelectValue placeholder="Toutes les langues" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="fr">Français</SelectItem>
									<SelectItem value="en">English</SelectItem>
									<SelectItem value="all">Toutes les langues</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</Specimen>
					<Specimen label="Stepper — formulaire de question">
						<div className="flex w-full flex-col gap-3">
							<Stepper
								steps={["Titre", "Détails", "Tags et langue", "Relecture"]}
								current={step}
							/>
							<div className="flex gap-2">
								<Button
									size="sm"
									variant="outline"
									disabled={step === 0}
									onClick={() => setStep((s) => s - 1)}
								>
									Précédent
								</Button>
								<Button
									size="sm"
									disabled={step === 3}
									onClick={() => setStep((s) => s + 1)}
								>
									Suivant
								</Button>
							</div>
						</div>
					</Specimen>
					<Specimen label="Timeline — frise du hackathon">
						<Timeline
							className="w-full max-w-md"
							items={[
								{
									date: "13 oct.",
									title: "Point de contrôle 1",
									description: "Staging à jour",
									state: "done",
								},
								{
									date: "17 oct.",
									title: "Point de contrôle 2",
									description: "Parcours de démo rejoué",
									state: "current",
								},
								{
									date: "24 oct.",
									title: "Gel des fonctionnalités",
									state: "upcoming",
								},
								{ date: "25 oct.", title: "Soumission", state: "upcoming" },
							]}
						/>
					</Specimen>
					<Specimen label="Dialog — confirmation">
						<Dialog>
							<DialogTrigger render={<Button variant="outline" />}>
								Ouvrir la modale
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Supprimer le compte</DialogTitle>
									<DialogDescription>
										Cette action anonymise ou efface vos données. Elle est
										définitive.
									</DialogDescription>
								</DialogHeader>
								<DialogFooter>
									<DialogClose render={<Button variant="outline" />}>
										Annuler
									</DialogClose>
									<DialogClose render={<Button variant="destructive" />}>
										Supprimer
									</DialogClose>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					</Specimen>
					<Specimen label="Table">
						<div className="w-full">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Tag</TableHead>
										<TableHead>Questions</TableHead>
										<TableHead>Suivi</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									<TableRow>
										<TableCell>mobile-money</TableCell>
										<TableCell>128</TableCell>
										<TableCell>
											<Badge variant="success">Suivi</Badge>
										</TableCell>
									</TableRow>
									<TableRow>
										<TableCell>ussd</TableCell>
										<TableCell>41</TableCell>
										<TableCell>
											<Badge variant="outline">Non suivi</Badge>
										</TableCell>
									</TableRow>
								</TableBody>
							</Table>
						</div>
					</Specimen>
					<Specimen label="Table headless — tri, sélection, pagination, menu ⋯ et motif">
						<div className="flex w-full flex-col gap-3">
							{(() => {
								const sorted = [...TABLE_DEMO].sort((a, b) => {
									if (!tableSort) {
										return 0;
									}
									const left = String(a[tableSort.key as "tag" | "questions"]);
									const right = String(b[tableSort.key as "tag" | "questions"]);
									const order = left.localeCompare(right, "fr", {
										numeric: true,
									});
									return tableSort.direction === "asc" ? order : -order;
								});
								const pageRows = sorted.slice(
									(tablePage - 1) * 3,
									tablePage * 3,
								);
								const ids = pageRows.map((row) => row.tag);
								return (
									<>
										<Table maxHeight={220}>
											<TableHeader>
												<TableRow>
													<TableSelectHead
														state={pageSelectionState(tableChecked, ids)}
														onToggle={() =>
															setTableChecked(togglePage(tableChecked, ids))
														}
													/>
													<TableSortHead
														sortKey="tag"
														sort={tableSort}
														onSortChange={setTableSort}
													>
														Tag
													</TableSortHead>
													<TableSortHead
														sortKey="questions"
														sort={tableSort}
														onSortChange={setTableSort}
													>
														Questions
													</TableSortHead>
													<TableHead className="w-12">
														<span className="sr-only">Actions</span>
													</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{pageRows.map((row) => (
													<TableRow
														key={row.tag}
														selected={tableChecked.has(row.tag)}
													>
														<TableSelectCell
															label={`Sélectionner ${row.tag}`}
															checked={tableChecked.has(row.tag)}
															onCheckedChange={() =>
																setTableChecked(
																	toggleRow(tableChecked, row.tag),
																)
															}
														/>
														<TableCell>{row.tag}</TableCell>
														<TableCell className="tabular-nums">
															{row.questions}
														</TableCell>
														<TableCell className="text-right">
															<RowActions
																label={`Actions pour ${row.tag}`}
																actions={[
																	{
																		id: "open",
																		label: "Voir les questions",
																		onSelect: () => {},
																	},
																	{
																		id: "reject",
																		label: "Rejeter ce Tag",
																		destructive: true,
																		onSelect: () => setTableReasonOpen(true),
																	},
																]}
															/>
														</TableCell>
													</TableRow>
												))}
												{pageRows.length === 0 && (
													<TableEmpty colSpan={4}>Aucun Tag.</TableEmpty>
												)}
											</TableBody>
										</Table>
										<TablePagination
											page={tablePage}
											pageCount={Math.ceil(TABLE_DEMO.length / 3)}
											pageSize={3}
											total={TABLE_DEMO.length}
											onPageChange={(next) => {
												setTablePage(next);
												setTableChecked(NO_SELECTION);
											}}
										/>
										<TableBulkBar
											count={tableChecked.size}
											onClear={() => setTableChecked(NO_SELECTION)}
											actions={
												<Button
													variant="destructive"
													size="sm"
													onClick={() => setTableReasonOpen(true)}
												>
													Rejeter la sélection…
												</Button>
											}
										/>
										<ReasonDialog
											open={tableReasonOpen}
											onOpenChange={setTableReasonOpen}
											title="Rejeter ce Tag"
											description="Le Tag est retiré du catalogue. L'action est enregistrée dans le journal d'audit."
											confirmLabel="Rejeter"
											onSubmit={() => {
												setTableChecked(NO_SELECTION);
												setTableReasonOpen(false);
											}}
										/>
									</>
								);
							})()}
						</div>
					</Specimen>
					<Specimen label="KpiCard — hausse, baisse, métrique à minimiser">
						<div className="grid w-full gap-4 md:grid-cols-3">
							<KpiCard
								label="Membres actifs"
								value="428"
								delta={12.4}
								hint="vs 7 jours"
								trend={[310, 322, 340, 365, 380, 402, 428]}
							/>
							<KpiCard
								label="Questions avec réponse"
								value="74 %"
								delta={-3.2}
								hint="vs 7 jours"
								trend={[78, 77, 76, 75, 75, 74, 74]}
							/>
							<KpiCard
								label="Questions sans réponse"
								value="51"
								delta={-6.3}
								lowerIsBetter
								hint="vs 7 jours"
								trend={[58, 56, 55, 54, 53, 52, 51]}
							/>
						</div>
					</Specimen>
					<Specimen label="ProviderButton, ThemeToggle">
						<div className="flex w-64 flex-col gap-2">
							<ProviderButton provider="github" />
							<ProviderButton provider="gitlab" />
							<ProviderButton provider="google" />
						</div>
						<ThemeToggle />
					</Specimen>
					<Specimen label="Tabs">
						<Tabs defaultValue="apercu" className="w-full max-w-md">
							<TabsList>
								<TabsTrigger value="apercu">Aperçu</TabsTrigger>
								<TabsTrigger value="regles">Règles</TabsTrigger>
								<TabsTrigger value="prix">Prix</TabsTrigger>
							</TabsList>
							<TabsContent value="apercu">
								Contenu de l'onglet Aperçu.
							</TabsContent>
							<TabsContent value="regles">
								Contenu de l'onglet Règles.
							</TabsContent>
							<TabsContent value="prix">Contenu de l'onglet Prix.</TabsContent>
						</Tabs>
					</Specimen>
					<Specimen label="ScrollArea — modifiable (registre shadcn)">
						<div className="flex w-full flex-col gap-4">
							<div className="flex flex-wrap items-end gap-4">
								<div className="flex flex-col gap-1.5">
									<Label>Défilement</Label>
									<SegmentedControl
										options={SCROLL_ORIENTATIONS}
										value={scrollOrientation}
										onValueChange={setScrollOrientation}
										labels={SCROLL_LABELS}
									/>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="ds-scroll-rows">Lignes</Label>
									<Input
										id="ds-scroll-rows"
										type="number"
										min={1}
										max={200}
										value={scrollRows}
										onChange={(event) =>
											setScrollRows(Number(event.target.value) || 1)
										}
										className="w-24"
									/>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="ds-scroll-height">Hauteur (px)</Label>
									<Input
										id="ds-scroll-height"
										type="number"
										min={80}
										max={480}
										step={16}
										value={scrollHeight}
										onChange={(event) =>
											setScrollHeight(Number(event.target.value) || 80)
										}
										className="w-28"
									/>
								</div>
							</div>
							<ScrollArea
								// Remounted when the content changes: the bars are measured on mount and on scroll.
								key={`${scrollOrientation}-${scrollRows}-${scrollHeight}`}
								orientation={scrollOrientation}
								style={{ height: scrollHeight }}
								className="w-full rounded-md border"
							>
								<ul className="divide-y">
									{Array.from({ length: scrollRows }, (_, row) => (
										<li
											key={row}
											className="whitespace-nowrap px-3 py-2 text-sm"
										>
											Ligne {row + 1}
											{scrollOrientation !== "vertical" &&
												" — un contenu volontairement long pour déborder sur la largeur et montrer la barre horizontale du composant, quelle que soit la largeur de la colonne dans laquelle il s'affiche : encore quelques mots pour être sûr"}
										</li>
									))}
								</ul>
							</ScrollArea>
						</div>
					</Specimen>
					<Specimen label="Collapsible — question repliable">
						<Collapsible className="w-full max-w-md" defaultOpen>
							<CollapsibleTrigger>
								Comment intégrer Orange Money en Node.js ?
							</CollapsibleTrigger>
							<CollapsiblePanel>
								<p className="pt-2 text-muted-foreground text-sm">
									J'appelle l'endpoint de paiement depuis mon backend mais le
									callback n'arrive jamais en local.
								</p>
							</CollapsiblePanel>
						</Collapsible>
					</Specimen>
					<Specimen label="VoteControl">
						<VoteControl
							score={12 + (vote === "up" ? 1 : vote === "down" ? -1 : 0)}
							value={vote}
							onValueChange={setVote}
						/>
						<VoteControl
							score={3}
							value={null}
							onValueChange={() => {}}
							orientation="vertical"
							disabled
						/>
					</Specimen>
					<Specimen label="AnswerCard — acceptée, agent, longue">
						<div className="grid w-full gap-4 md:grid-cols-2">
							<AnswerCard
								author="awa_dev"
								ago="il y a 1 h"
								score={12 + (vote === "up" ? 1 : vote === "down" ? -1 : 0)}
								vote={vote}
								onVoteChange={setVote}
								accepted
								onCopyCode={() => {}}
								onShare={() => {}}
							>
								<p>
									Expose un `callback_url` public avec un tunnel, puis vérifie
									la signature.
								</p>
							</AnswerCard>
							<AnswerCard
								author="Claude-bot"
								agentOf="koffi"
								ago="hier"
								score={4}
								vote={null}
								onVoteChange={() => {}}
								voteDisabled
								onAccept={() => {}}
								onShare={() => {}}
							>
								<p>
									Réponse d'un agent : badgée, jamais promue au-dessus d'un
									humain.
								</p>
							</AnswerCard>
							<AnswerCard
								author="yaya"
								ago="il y a 3 j"
								score={1}
								vote={null}
								onVoteChange={() => {}}
								long
								className="md:col-span-2"
							>
								{Array.from({ length: 6 }, (_, i) => (
									<p key={i} className="mb-2">
										Paragraphe {i + 1} d'une longue réponse, replié tant que le
										membre ne demande pas la suite.
									</p>
								))}
							</AnswerCard>
						</div>
					</Specimen>
					<Specimen label="InputGroup">
						<InputGroup className="w-full max-w-md">
							<InputGroupAddon>
								<InputGroupText>
									<SearchIcon />
								</InputGroupText>
							</InputGroupAddon>
							<InputGroupInput placeholder="Rechercher une question" />
							<InputGroupAddon align="inline-end">
								<InputGroupButton>Chercher</InputGroupButton>
							</InputGroupAddon>
						</InputGroup>
					</Specimen>
					<Specimen label="DropdownMenu">
						<DropdownMenu>
							<DropdownMenuTrigger render={<Button variant="outline" />}>
								Mon compte
							</DropdownMenuTrigger>
							<DropdownMenuContent className="bg-card">
								<DropdownMenuGroup>
									<DropdownMenuLabel>Compte</DropdownMenuLabel>
									<DropdownMenuSeparator />
									<DropdownMenuItem>Profil</DropdownMenuItem>
									<DropdownMenuItem variant="destructive">
										Se déconnecter
									</DropdownMenuItem>
								</DropdownMenuGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					</Specimen>
					<Specimen label="Empty">
						<Empty className="w-full max-w-md">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<FileTextIcon />
								</EmptyMedia>
								<EmptyTitle>Aucune question</EmptyTitle>
								<EmptyDescription>
									Suivez des tags pour voir du contenu ici.
								</EmptyDescription>
							</EmptyHeader>
							<EmptyContent>
								<Button size="sm">Suivre un tag</Button>
							</EmptyContent>
						</Empty>
					</Specimen>
					<Specimen label="SegmentedControl">
						<SegmentedControl
							options={TABS}
							value={tab}
							onValueChange={setTab}
						/>
					</Specimen>
					<Specimen label="FollowedTags">
						<FollowedTags
							className="w-full"
							tags={["mobile-money", "nodejs", "ussd", "docker"]}
							highlighted={["mobile-money", "nodejs"]}
							addAction={
								<span className="shrink-0 rounded-full border border-dashed px-3 py-1 text-muted-foreground text-sm">
									+ suivre
								</span>
							}
						/>
					</Specimen>
					<Specimen label="QuestionCard">
						<div className="grid w-full gap-4 md:grid-cols-2">
							{SAMPLE_QUESTIONS.slice(0, 2).map((question) => (
								<QuestionCard key={question.id} {...question} />
							))}
						</div>
					</Specimen>
					<Specimen label="CadevBanner">
						<CadevBanner
							className="w-full"
							name="Hackathon CADEV 2026"
							summary="Concours de développement ouvert aux équipes africaines."
							closesAt="2026-10-25T17:00:00Z"
							now={new Date("2026-10-11T22:00:00Z")}
							milestones={[
								{
									key: "submission_close",
									label: "Soumissions",
									startsAt: "2026-10-25T17:00:00Z",
								},
								{
									key: "peer_vote",
									label: "Votes entre pairs",
									startsAt: "2026-10-25T18:00:00Z",
								},
								{
									key: "public_vote",
									label: "Vote du public",
									startsAt: "2026-10-27T00:00:00Z",
								},
								{
									key: "jury",
									label: "Jury",
									startsAt: "2026-11-01T00:00:00Z",
								},
							]}
							action={
								<span className="rounded-full bg-background px-4 py-2 font-semibold text-primary text-sm">
									Voir les règles →
								</span>
							}
						/>
					</Specimen>
					<Specimen label="CadevBanner — ruban (mobile, Member)">
						<CadevBanner
							className="w-full"
							variant="ribbon"
							name="CADEV 2026"
							summary=""
							closesAt="2026-10-25T17:00:00Z"
							now={new Date("2026-10-11T22:00:00Z")}
						/>
					</Specimen>
					<Specimen label="CadevBanner — rail (bureau, Member)">
						<CadevBanner
							className="w-72"
							variant="rail"
							name="CADEV 2026"
							summary=""
							closesAt="2026-10-25T17:00:00Z"
							now={new Date("2026-10-11T22:00:00Z")}
						/>
					</Specimen>
				</Section>

				<Section title="Organismes">
					<Specimen label="QuestionFeed">
						<QuestionFeed className="w-full" questions={SAMPLE_QUESTIONS} />
					</Specimen>
					<Specimen label="Message (MessageGroup)">
						<MessageGroup className="w-full max-w-md">
							<Message>
								<MessageAvatar>AW</MessageAvatar>
								<MessageContent>
									<MessageHeader>awa_dev</MessageHeader>
									<Bubble variant="muted">
										<BubbleContent>
											Quelqu&apos;un a testé le callback en local ?
										</BubbleContent>
									</Bubble>
									<MessageFooter>il y a 2 h</MessageFooter>
								</MessageContent>
							</Message>
							<Message align="end">
								<MessageAvatar>AD</MessageAvatar>
								<MessageContent>
									<Bubble>
										<BubbleContent>Oui, avec un tunnel ngrok.</BubbleContent>
									</Bubble>
								</MessageContent>
							</Message>
						</MessageGroup>
					</Specimen>
					<Specimen label="AnswerForm — écrire, aperçu, états">
						<div className="grid w-full gap-4 md:grid-cols-2">
							<AnswerForm
								value={answerText}
								onValueChange={setAnswerText}
								preview={<p>{answerText}</p>}
								onSubmit={() => {}}
								status="draft"
							/>
							<AnswerForm
								value="Ma réponse hors ligne"
								onValueChange={() => {}}
								preview={<p>Ma réponse hors ligne</p>}
								onSubmit={() => {}}
								status="pending"
							/>
							<AnswerForm
								value="Texte conservé après rejet"
								onValueChange={() => {}}
								preview={<p>Texte conservé après rejet</p>}
								onSubmit={() => {}}
								status="rejected"
								rejectionReason="Vous avez déjà répondu à cette question"
								className="md:col-span-2"
							/>
						</div>
					</Specimen>
					<Specimen label="LoginCard — SSO et consentement">
						<div className="w-full max-w-sm">
							<LoginCard consentVersion="2026-10" onProviderSelect={() => {}} />
						</div>
					</Specimen>
					<Specimen label="LoginDialog — bouton qui ouvre la connexion">
						<div className="flex w-full justify-center py-2">
							<LoginDialog
								consentVersion="2026-10"
								onProviderSelect={() => {}}
							/>
						</div>
					</Specimen>
					<Specimen label="ModerationTable (données d'exemple)">
						<div className="w-full">
							<ModerationTable
								rows={sortModerationRows(moderationRows, moderationSort)}
								onConfirm={() => {}}
								sort={moderationSort}
								onSortChange={setModerationSort}
								maxHeight={320}
							/>
						</div>
					</Specimen>
					<Specimen label="AuditLog (données d'exemple)">
						<div className="flex w-full flex-col gap-2">
							<AuditLog
								entries={auditEntries.slice(0, 4)}
								actionsOf={(entry) => [
									{
										id: "detail",
										label: "Voir le détail",
										icon: <EyeIcon />,
										onSelect: () =>
											setAuditNote(`Détail de « ${entry.action} » ouvert`),
									},
									{
										id: "by-actor",
										label: "Filtrer par acteur",
										icon: <FunnelIcon />,
										onSelect: () =>
											setAuditNote(
												`Journal filtré sur l'acteur ${entry.actor}`,
											),
									},
									{
										id: "by-target",
										label: "Filtrer par cible",
										icon: <FunnelIcon />,
										onSelect: () =>
											setAuditNote(
												`Journal filtré sur la cible ${entry.target}`,
											),
									},
									{
										id: "open-target",
										label: "Ouvrir la cible",
										icon: <ExternalLinkIcon />,
										onSelect: () =>
											setAuditNote(`Cible ${entry.target} ouverte`),
									},
									{
										id: "export",
										label: "Exporter en CSV",
										icon: <DownloadIcon />,
										// Réservé à `audit:export` : grisé pour un Moderator.
										disabled: entry.actor !== "admin@codesphere",
										onSelect: () =>
											setAuditNote("Export CSV de la sélection filtrée lancé"),
									},
								]}
							/>
							<p aria-live="polite" className="text-muted-foreground text-xs">
								{auditNote ??
									"Ouvrez le menu ⋯ d'une ligne. L'export est grisé pour les acteurs sans le droit audit:export."}
							</p>
						</div>
					</Specimen>
					<Specimen label="KpiGrid">
						<KpiGrid
							className="w-full"
							items={[
								{
									id: "a",
									label: "Membres actifs",
									value: "428",
									delta: 12.4,
									trend: [3, 5, 6, 8, 9, 12],
								},
								{
									id: "b",
									label: "Questions posées",
									value: "193",
									delta: 8.1,
									trend: [3, 4, 4, 6, 5, 7],
								},
							]}
						/>
					</Specimen>
					<Specimen label="AppFooter">
						<AppFooter
							className="w-full rounded-md border-t-0"
							version="1.0.0"
							sha="6a2db9dd7e5e2bd5b4a4c60c247cc8bb13ff90bf"
							links={[
								{ label: "Confidentialité", href: "/legal/privacy" },
								{ label: "Conditions", href: "/legal/terms" },
							]}
						/>
					</Specimen>
					<Specimen label="Field — libellé, aide et erreur par champ">
						<div className="grid w-full gap-4 md:grid-cols-2">
							<Field
								id="ds-title-ok"
								label="Titre"
								description="Résumez le problème en une phrase."
								required
							>
								<Input
									id="ds-title-ok"
									aria-describedby="ds-title-ok-description"
								/>
							</Field>
							<Field
								id="ds-title-ko"
								label="Titre"
								error="Le titre doit faire au moins 15 caractères."
								required
							>
								<Input
									id="ds-title-ko"
									aria-invalid
									aria-describedby="ds-title-ko-error"
									defaultValue="Aide"
								/>
							</Field>
						</div>
					</Specimen>
					<Specimen label="TagInput — saisie libre et suggestions">
						<div className="w-full max-w-md">
							<TagInput
								value={questionTags}
								onValueChange={setQuestionTags}
								suggestions={[
									"nodejs",
									"mobile-money",
									"ussd",
									"postgresql",
									"docker",
									"pwa",
								]}
							/>
						</div>
					</Specimen>
					<Specimen label="TagPicker — onboarding (3 tags minimum, passable)">
						<TagPicker
							className="w-full"
							tags={[
								"mobile-money",
								"nodejs",
								"ussd",
								"postgresql",
								"docker",
								"pwa",
								"react-native",
								"ia",
								"securite",
							]}
							value={pickedTags}
							onValueChange={setPickedTags}
							onSubmit={() => {}}
							onSkip={() => {}}
						/>
					</Specimen>
					<Specimen label="FeedFilters — langue et pays">
						<FeedFilters
							language={feedLanguage}
							onLanguageChange={setFeedLanguage}
							country={feedCountry}
							onCountryChange={setFeedCountry}
							countries={[
								{ value: "all", label: "Tous les pays" },
								{ value: "SN", label: "Sénégal" },
								{ value: "CI", label: "Côte d'Ivoire" },
								{ value: "NG", label: "Nigéria" },
							]}
						/>
					</Specimen>
					<Specimen label="OfflineBanner — hors ligne / synchronisation">
						<div className="flex w-full flex-col gap-3">
							<div className="flex gap-2">
								<Button
									size="sm"
									variant="outline"
									onClick={() => setOnline((value) => !value)}
								>
									{online ? "Passer hors ligne" : "Revenir en ligne"}
								</Button>
							</div>
							<OfflineBanner online={online} pendingCount={3} />
						</div>
					</Specimen>
					<Specimen label="RelatedQuestions — pendant la saisie du titre">
						<RelatedQuestions
							className="w-full max-w-lg"
							questions={[
								{
									id: "r1",
									title: "Intégrer l'API Orange Money en Node.js",
									answers: 3,
									answered: true,
									href: "#",
								},
								{
									id: "r2",
									title: "Callback de paiement jamais reçu en local",
									answers: 1,
									answered: false,
									href: "#",
								},
							]}
						/>
					</Specimen>
					<Specimen label="Countdown — clôture du hackathon">
						<Countdown target="2026-10-25T23:59:00Z" />
						<Countdown target="2026-10-01T00:00:00Z" />
					</Specimen>
					<Specimen label="SettingsSection, SettingRow, LanguageSwitcher">
						<SettingsSection
							className="w-full max-w-xl"
							title="Préférences"
							description="Réglages de votre compte."
						>
							<SettingRow
								title="Langue de l'interface"
								description="Français ou English."
							>
								<LanguageSwitcher value={locale} onValueChange={setLocale} />
							</SettingRow>
							<SettingRow
								title="Masquer le contenu d'agent"
								description="Les réponses d'agents restent badgées."
							>
								<Switch aria-label="Masquer le contenu d'agent" />
							</SettingRow>
						</SettingsSection>
					</Specimen>
					<Specimen label="ApiKeyReveal — clé d'agent affichée une seule fois">
						<Button variant="outline" onClick={() => setKeyOpen(true)}>
							Créer une clé
						</Button>
						<ApiKeyReveal
							open={keyOpen}
							onOpenChange={setKeyOpen}
							agentName="Claude-bot"
							apiKey="csk_live_7f3a91c2d84e4b6f9a1c0e5d2b8a64f3"
						/>
					</Specimen>
					<Specimen label="Pages complètes">
						<Link href="/admin" className="text-primary text-sm underline">
							/admin (modération)
						</Link>
						<Link href="/dashboard" className="text-primary text-sm underline">
							/dashboard
						</Link>
						<Link
							href="/admin/audit"
							className="text-primary text-sm underline"
						>
							/admin/audit
						</Link>
						<Link href="/signin" className="text-primary text-sm underline">
							/signin (connexion SSO)
						</Link>
					</Specimen>
					<Specimen label="MessageScroller">
						<div className="h-48 w-full max-w-md">
							<MessageScrollerProvider>
								<MessageScroller>
									<MessageScrollerViewport>
										<MessageScrollerContent>
											{Array.from({ length: 8 }, (_, i) => (
												<MessageScrollerItem key={i} className="p-2 text-sm">
													Message {i + 1}
												</MessageScrollerItem>
											))}
										</MessageScrollerContent>
									</MessageScrollerViewport>
								</MessageScroller>
							</MessageScrollerProvider>
						</div>
					</Specimen>
					<Specimen label="AppHeader">
						<div className="w-full overflow-hidden rounded-md">
							<AppHeader
								className="static!"
								tabs={TABS}
								activeTab={tab}
								onTabChange={setTab}
								actions={<Button size="sm">+ Question</Button>}
							/>
						</div>
					</Specimen>
					<Specimen label="Empty — état hors-ligne">
						<Empty className="w-full max-w-md">
							<EmptyHeader>
								<EmptyTitle>Hors-ligne</EmptyTitle>
								<EmptyDescription>
									Vos brouillons sont conservés localement.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					</Specimen>
				</Section>

				<Section
					title="Socle admin"
					description="Composants du back-office : liste et fiche, enregistrement, confirmation en deux temps."
				>
					<Specimen label="AdminMasterDetail — GroupedList + RecordSheet">
						<AdminMasterDetail
							className="w-full"
							list={
								<GroupedList
									label="Membres"
									items={ADMIN_ITEMS}
									groups={ADMIN_GROUPS}
									selectedId={adminSelected}
									onSelect={(item) => setAdminSelected(item.id)}
								/>
							}
							detail={
								<RecordSheet
									title={
										ADMIN_ITEMS.find((item) => item.id === adminSelected)?.name
									}
									editing={adminEditing}
									onEdit={() => setAdminEditing(true)}
								>
									<RecordSection title="Profil">
										<RecordFields
											fields={[
												{ label: "Pays", value: "Burkina Faso" },
												{ label: "Langue", value: "Français" },
											]}
										/>
									</RecordSection>
								</RecordSheet>
							}
						/>
					</Specimen>
					<Specimen label="SaveBar — modifié / inchangé">
						<div className="flex w-full flex-col gap-3">
							<SaveBar
								dirty
								onSave={() => setAdminEditing(false)}
								onDiscard={() => setAdminEditing(false)}
							/>
							<SaveBar dirty={false} onSave={() => {}} onDiscard={() => {}} />
						</div>
					</Specimen>
					<Specimen label="ConfirmTwoStep + ReasonField">
						<div className="flex w-full max-w-md flex-col gap-3">
							<ReasonField
								id="ds-reason"
								value={reason}
								onValueChange={setReason}
							/>
							<ConfirmTwoStep
								label="Suspendre ce Member"
								disabled={reason.trim().length < 3}
								onConfirm={() => setReason("")}
							/>
						</div>
					</Specimen>
					<Specimen label="StateGate — chargement, erreur, vide">
						<div className="grid w-full gap-4 md:grid-cols-3">
							<StateGate status="loading">
								<p>Contenu</p>
							</StateGate>
							<StateGate status="error" onRetry={() => {}}>
								<p>Contenu</p>
							</StateGate>
							<StateGate status="empty">
								<p>Contenu</p>
							</StateGate>
						</div>
					</Specimen>
				</Section>

				<Section
					title="Mouvement"
					description="Transitions du registre @transitions (packages/ui/REGISTRY.md) : respectent prefers-reduced-motion et le mode économie de données."
				>
					<MotionSpecimens />
				</Section>
			</main>
		</div>
	);
}
