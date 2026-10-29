"use client";

import { cn } from "@codesphere/ui/lib/utils";
import { useEffect, useState } from "react";

type BannerMilestone = { key: string; label: string; startsAt: string };

type CadevBannerLabels = {
	eyebrow: string;
	days: string;
	/** Unit after the number in the rail's ring, e.g. « j » (12j) or « d » (12d). */
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
	/** `card`: full banner; `ribbon`: one compact line; `rail`: a card with a progress ring. */
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

const SURFACE = "relative overflow-hidden text-primary-foreground bg-cadev";

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
					<p className="text-xs opacity-80">{l.closes}</p>
				</div>
				<p className="font-mono font-semibold text-xl tabular-nums">
					{pad(left.days)} j {pad(left.hours)} h
				</p>
				{action && <div className="ml-auto">{action}</div>}
			</section>
		);
	}

	if (variant === "rail") {
		const total = 14 * 86_400_000;
		const frac =
			left.current === null
				? 0
				: Math.max(
						0,
						Math.min(1, (new Date(closesAt).getTime() - left.current) / total),
					);
		const c = 2 * Math.PI * 34;
		return (
			<section
				data-slot="cadev-banner"
				aria-label={l.eyebrow}
				className={cn(
					"flex flex-col gap-3 rounded-2xl border border-border bg-card p-5",
					className,
				)}
				{...props}
			>
				<p className="font-mono font-semibold text-2xs text-muted-foreground uppercase tracking-widest">
					{l.eyebrow}
				</p>
				<div className="flex items-center gap-4">
					<svg
						viewBox="0 0 80 80"
						className="size-20 shrink-0"
						aria-hidden="true"
					>
						<circle
							cx="40"
							cy="40"
							r="34"
							fill="none"
							strokeWidth="7"
							className="stroke-muted"
						/>
						<circle
							cx="40"
							cy="40"
							r="34"
							fill="none"
							strokeWidth="7"
							strokeLinecap="round"
							className="stroke-primary"
							strokeDasharray={c.toFixed(1)}
							strokeDashoffset={(c * (1 - frac)).toFixed(1)}
							transform="rotate(-90 40 40)"
						/>
						<text
							x="40"
							y="46"
							textAnchor="middle"
							className="fill-foreground font-mono font-semibold"
							fontSize="20"
						>
							{left.days ?? "…"}
							{l.daysShort}
						</text>
					</svg>
					<div className="min-w-0">
						<p className="font-semibold">{name}</p>
						<p className="text-muted-foreground text-sm">{l.closes}</p>
					</div>
				</div>
				{action}
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
			className={cn(SURFACE, "rounded-3xl p-6 md:p-7", className)}
			{...props}
		>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="min-w-0 max-w-xl">
					<p className="flex items-center gap-2 font-mono font-semibold text-2xs uppercase tracking-widest opacity-80">
						<span className="size-1.5 rounded-full bg-gold ring-4 ring-gold/25" />
						{l.eyebrow}
					</p>
					<h2 className="mt-2 text-balance font-bold text-2xl leading-tight tracking-tight md:text-3xl">
						{name}
					</h2>
					<p className="mt-2 text-sm opacity-85">{summary}</p>
				</div>
				<div className="flex items-baseline gap-4 font-mono">
					<div>
						<p className="font-semibold text-5xl tabular-nums leading-none tracking-tighter">
							{pad(left.days)}
						</p>
						<p className="mt-1 font-sans text-2xs uppercase tracking-widest opacity-70">
							{l.days}
						</p>
					</div>
					<div>
						<p className="font-semibold text-5xl tabular-nums leading-none tracking-tighter">
							{pad(left.hours)}
						</p>
						<p className="mt-1 font-sans text-2xs uppercase tracking-widest opacity-70">
							{l.hours}
						</p>
					</div>
				</div>
			</div>
			{(milestones.length > 0 || action) && (
				<div className="mt-6 flex flex-wrap items-center gap-4 border-white/15 border-t pt-4">
					{milestones.length > 0 && (
						<ol
							aria-label={l.timeline}
							className="grid min-w-0 flex-[1_1_26rem] grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-4"
						>
							{milestones.map((m, i) => {
								const done = next === -1 ? left.current !== null : i < next;
								const isNext = i === next;
								return (
									<li key={m.key} className="relative pt-4 text-xs opacity-90">
										<span
											className={cn(
												"absolute top-0 left-0 size-2.5 rounded-full border-2",
												done && "border-white bg-white",
												isNext && "border-gold bg-gold ring-4 ring-gold/25",
												!done && !isNext && "border-white/50 bg-transparent",
											)}
										/>
										<span className="block font-semibold">{m.label}</span>
										<span className="font-mono text-2xs opacity-80">
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
					{action && <div className="ml-auto">{action}</div>}
				</div>
			)}
			{left.days !== null && (
				<p className="mt-3 text-2xs opacity-70">{l.remaining(left.days)}</p>
			)}
		</section>
	);
}

export { CadevBanner, type CadevBannerLabels, type CadevBannerProps };
