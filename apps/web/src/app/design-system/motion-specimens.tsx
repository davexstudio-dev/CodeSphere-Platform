"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import { Skeleton } from "@codesphere/ui/components/atoms/skeleton";
import { SuccessCheck } from "@codesphere/ui/components/atoms/success-check";
import { Switch } from "@codesphere/ui/components/atoms/switch";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@codesphere/ui/components/molecules/dropdown-menu";
import { SegmentedControl } from "@codesphere/ui/components/molecules/segmented-control";
import { SkeletonReveal } from "@codesphere/ui/components/molecules/skeleton-reveal";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@codesphere/ui/components/molecules/tabs";
import {
	RevealLine,
	TextsReveal,
} from "@codesphere/ui/components/molecules/texts-reveal";
import { useState } from "react";
import { toast } from "sonner";

function Specimen({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2">
			<span className="font-mono text-muted-foreground text-xs">{label}</span>
			<div className="flex flex-wrap items-center gap-3 rounded-md border p-4">
				{children}
			</div>
		</div>
	);
}

const VIEWS = ["Liste", "Grille", "Carte"] as const;

/** One specimen per transition of the @transitions registry (packages/ui/REGISTRY.md). */
export function MotionSpecimens() {
	const [view, setView] = useState<(typeof VIEWS)[number]>("Liste");
	const [ready, setReady] = useState(false);
	const [check, setCheck] = useState(false);
	const [replay, setReplay] = useState(0);
	const [invalid, setInvalid] = useState(false);

	return (
		<>
			<Specimen label="Tabs sliding — TabsList (Base UI) et SegmentedControl">
				<Tabs defaultValue="a">
					<TabsList>
						<TabsTrigger value="a">Questions</TabsTrigger>
						<TabsTrigger value="b">Réponses</TabsTrigger>
						<TabsTrigger value="c">Tags</TabsTrigger>
					</TabsList>
					<TabsContent value="a" className="text-muted-foreground text-sm">
						Le pastille glisse d'un onglet à l'autre.
					</TabsContent>
					<TabsContent value="b" className="text-muted-foreground text-sm">
						Réponses.
					</TabsContent>
					<TabsContent value="c" className="text-muted-foreground text-sm">
						Tags.
					</TabsContent>
				</Tabs>
				<SegmentedControl
					options={VIEWS}
					value={view}
					onValueChange={setView}
				/>
			</Specimen>
			<Specimen label="Menu dropdown — il grandit depuis son déclencheur">
				<DropdownMenu>
					<DropdownMenuTrigger render={<Button variant="outline" />}>
						Ouvrir le menu
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						<DropdownMenuItem>Profil</DropdownMenuItem>
						<DropdownMenuItem>Réglages</DropdownMenuItem>
						<DropdownMenuItem>Se déconnecter</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</Specimen>
			<Specimen label="Texts reveal — titre puis ligne d'appui, en décalé">
				<TextsReveal key={replay} className="flex flex-col gap-1">
					<RevealLine as="h3" line={1} className="font-semibold text-lg">
						Que voulez-vous suivre ?
					</RevealLine>
					<RevealLine as="p" line={2} className="text-muted-foreground text-sm">
						Choisissez au moins trois tags.
					</RevealLine>
				</TextsReveal>
				<Button
					variant="outline"
					size="sm"
					onClick={() => setReplay((n) => n + 1)}
				>
					Rejouer
				</Button>
			</Specimen>
			<Specimen label="Skeleton reveal — le squelette se fond dans le contenu">
				<SkeletonReveal
					ready={ready}
					className="w-64"
					skeleton={
						<div className="flex flex-col gap-2">
							<Skeleton className="h-5 w-40" />
							<Skeleton className="h-4 w-full" />
						</div>
					}
				>
					<div className="flex flex-col gap-2">
						<span className="font-medium">awa_dev</span>
						<span className="text-muted-foreground text-sm">
							12 réponses, 340 de réputation.
						</span>
					</div>
				</SkeletonReveal>
				<Button variant="outline" size="sm" onClick={() => setReady((r) => !r)}>
					{ready ? "Recharger" : "Charger"}
				</Button>
			</Specimen>
			<Specimen label="Toast — flou et durées d'ouverture/fermeture">
				<Button
					variant="outline"
					size="sm"
					onClick={() => toast.success("Modifications enregistrées")}
				>
					Afficher un toast
				</Button>
			</Specimen>
			<Specimen label="Success check — la coche se dessine">
				<span className="size-10 text-success">
					<SuccessCheck show={check} className="size-full" />
				</span>
				<Button variant="outline" size="sm" onClick={() => setCheck((c) => !c)}>
					{check ? "Masquer" : "Valider"}
				</Button>
			</Specimen>
			<Specimen label="Error shake — le champ tremble quand il devient invalide">
				<Input
					aria-label="Titre"
					className="w-64"
					placeholder="Titre"
					aria-invalid={invalid}
				/>
				<Button
					variant="outline"
					size="sm"
					onClick={() => setInvalid((i) => !i)}
				>
					{invalid ? "Corriger" : "Marquer invalide"}
				</Button>
			</Specimen>
			<Specimen label="Toggle — le curseur se pose avec un léger dépassement">
				<Switch aria-label="Exemple" />
				<Switch aria-label="Exemple activé" defaultChecked />
			</Specimen>
			<p className="text-muted-foreground text-xs">
				Panel reveal : sélectionnez un Member dans « Socle admin », la fiche
				monte en place.
			</p>
		</>
	);
}
