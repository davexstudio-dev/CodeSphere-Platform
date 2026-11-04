"use client";

import { cn } from "@codesphere/ui/lib/utils";
import { useEffect, useState } from "react";

type BannerMilestone = { key: string; label: string; startsAt: string };

type CadevBannerLabels = {
	eyebrow: string;
	days: string;
	/** Unit after the number in a short countdown, e.g. « j » (12 j) or « d » (12 d). */
	daysShort: string;
	hours: string;
	/** Under the countdown, e.g. « 13 jours avant la clôture · affiché dans votre fuseau horaire ». */
	remaining: (days: number) => string;
	/** Short line of the ribbon, e.g. « Clôture des soumissions le 25 oct. à 17 h GMT ». */
	closes: string;
	timeline: string;
};

const FR: CadevBannerLabels = {
	eyebrow: "Hackathon en cours",
	days: "jours",
	daysShort: "j",
	hours: "heures",
	remaining: (days) =>
		`${days} jours avant la clôture · affiché dans votre fuseau horaire`,
	closes: "Clôture des soumissions",
	timeline: "Calendrier du hackathon",
};

type CadevBannerProps = Omit<React.ComponentProps<"section">, "children"> & {
	name: string;
	summary: string;
	/** ISO instant submissions close; the countdown runs to it. */
	closesAt: string;
	/** Dated steps shown as a timeline (card variant). */
	milestones?: readonly BannerMilestone[];
	/** `card`: full banner with the calendar; `ribbon`: one compact line; `rail`: the compact card of a column. */
	variant?: "card" | "ribbon" | "rail";
	/** Call to action, e.g. the link to the Hackathon page. */
	action?: React.ReactNode;
	labels?: Partial<CadevBannerLabels>;
	/** Locale of the Milestone dates (the app's, e.g. "fr"); dates use the viewer's timezone. */
	locale?: string;
	/** Freeze the clock (tests, previews). */
	now?: Date;
};

/** Time left before `target`, computed on the client only so the server markup never mismatches. */
function useRemaining(target: string, now?: Date) {
	const [current, setCurrent] = useState<number | null>(
		now ? now.getTime() : null,
	);
	useEffect(() => {
		if (now) {
			setCurrent(now.getTime());
			return;
		}
		setCurrent(Date.now());
		const id = setInterval(() => setCurrent(Date.now()), 60_000);
		return () => clearInterval(id);
	}, [now]);
	if (current === null) {
		return { current: null, days: null, hours: null };
	}
	const ms = Math.max(0, new Date(target).getTime() - current);
	return {
		current,
		days: Math.floor(ms / 86_400_000),
		hours: Math.floor((ms % 86_400_000) / 3_600_000),
	};
}

const pad = (n: number | null) =>
	n === null ? "…" : n < 10 ? `0${n}` : String(n);

const SURFACE = "relative overflow-hidden bg-cadev text-cadev-foreground";

/** The CADEV 2026 banner: countdown in the viewer's timezone and the contest calendar. */
function CadevBanner({
	name,
	summary,
	closesAt,
	milestones = [],
	variant = "card",
	action,
	labels,
	locale,
	now,
	className,
	...props
}: CadevBannerProps) {
	const l = { ...FR, ...labels };
	const left = useRemaining(closesAt, now);

	if (variant === "ribbon") {
		return (
			<section
				data-slot="cadev-banner"
				aria-label={l.eyebrow}
				className={cn(
					SURFACE,
					"flex flex-wrap items-center gap-4 rounded-xl px-4 py-3",
					className,
				)}
				{...props}
			>
				<div className="min-w-0">
					<p className="truncate font-semibold">{name}</p>
					<p className="text-cadev-muted text-xs">{l.closes}</p>
				</div>
				<p className="font-mono font-semibold text-xl tabular-nums">
					{pad(left.days)} {l.daysShort} {pad(left.hours)} h
				</p>
				{action && <div className="ml-auto">{action}</div>}
			</section>
		);
	}

	const eyebrow = (
		<p className="flex items-center gap-2 font-mono font-semibold text-2xs uppercase tracking-widest">
			<span className="size-1.5 rounded-full bg-gold ring-4 ring-gold/25" />
			{l.eyebrow}
		</p>
	);

	if (variant === "rail") {
		return (
			<section
				data-slot="cadev-banner"
				aria-label={l.eyebrow}
				className={cn(SURFACE, "grid gap-3 rounded-2xl p-5", className)}
				{...props}
			>
				{eyebrow}
				<h2 className="text-balance font-bold text-xl leading-tight tracking-tight">
					{name}
				</h2>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<p className="font-mono font-semibold text-2xl tabular-nums">
						{pad(left.days)} {l.daysShort} {pad(left.hours)} h
					</p>
					{action}
				</div>
			</section>
		);
	}

	const nowMs = left.current;
	const next =
		nowMs === null
			? -1
			: milestones.findIndex((m) => new Date(m.startsAt).getTime() > nowMs);

	return (
		<section
			data-slot="cadev-banner"
			aria-label={l.eyebrow}
			className={cn(SURFACE, "grid gap-6 rounded-3xl p-6 md:p-7", className)}
			{...props}
		>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="grid min-w-0 max-w-xl flex-[1_1_18rem] gap-2">
					{eyebrow}
					<h2 className="text-balance font-bold text-2xl leading-tight tracking-tight md:text-3xl">
						{name}
					</h2>
					<p className="text-cadev-muted text-sm">{summary}</p>
				</div>
				<div className="flex items-baseline gap-4 font-mono">
					<div>
						<p className="font-semibold text-5xl tabular-nums leading-none tracking-tighter">
							{pad(left.days)}
						</p>
						<p className="mt-1 font-sans text-2xs text-cadev-muted uppercase tracking-widest">
							{l.days}
						</p>
					</div>
					<div>
						<p className="font-semibold text-5xl tabular-nums leading-none tracking-tighter">
							{pad(left.hours)}
						</p>
						<p className="mt-1 font-sans text-2xs text-cadev-muted uppercase tracking-widest">
							{l.hours}
						</p>
					</div>
				</div>
			</div>
			{milestones.length > 0 && (
				<ol
					aria-label={l.timeline}
					className="grid gap-3 sm:auto-cols-fr sm:grid-flow-col sm:gap-0"
				>
					{milestones.map((m, i) => {
						const done = next === -1 ? left.current !== null : i < next;
						const isNext = i === next;
						return (
							<li
								key={m.key}
								aria-current={isNext ? "step" : undefined}
								className="relative pl-6 text-sm sm:pt-5 sm:pr-3 sm:pl-0"
							>
								{i < milestones.length - 1 && (
									<span className="absolute inset-x-0 top-[5px] hidden h-0.5 bg-cadev-muted/30 sm:block" />
								)}
								<span
									className={cn(
										"absolute top-1 left-0 size-3 rounded-full border-2 bg-cadev sm:top-0",
										done && "border-cadev-foreground bg-cadev-foreground",
										isNext && "border-gold bg-gold ring-4 ring-gold/25",
										!done && !isNext && "border-cadev-muted",
									)}
								/>
								<span className="block font-semibold leading-snug">
									{m.label}
								</span>
								<span className="font-mono text-cadev-muted text-xs">
									{nowMs === null
										? "…"
										: new Intl.DateTimeFormat(locale, {
												day: "numeric",
												month: "short",
											}).format(new Date(m.startsAt))}
								</span>
							</li>
						);
					})}
				</ol>
			)}
			<div className="flex flex-wrap items-center justify-between gap-3">
				{left.days !== null && (
					<p className="text-cadev-muted text-xs">{l.remaining(left.days)}</p>
				)}
				{action}
			</div>
		</section>
	);
}

export { CadevBanner, type CadevBannerLabels, type CadevBannerProps };
