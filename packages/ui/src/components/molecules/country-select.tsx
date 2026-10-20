"use client";

import { Combobox } from "@base-ui/react/combobox";
import { Flag } from "@codesphere/ui/components/atoms/flag";
import {
	type CountryOption,
	countryOptions,
	filterCountries,
} from "@codesphere/ui/lib/countries";
import { cn } from "@codesphere/ui/lib/utils";
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";

type CountrySelectLabels = {
	placeholder: string;
	empty: string;
	clear: string;
	open: string;
	africa: string;
	others: string;
};

const FRENCH: CountrySelectLabels = {
	placeholder: "Choisir un pays",
	empty: "Aucun pays trouvé.",
	clear: "Effacer le pays",
	open: "Ouvrir la liste des pays",
	africa: "Afrique",
	others: "Autres pays",
};

type CountrySelectProps = {
	id?: string;
	/** Accessible name when no visible label points at the field. */
	ariaLabel?: string;
	/** Selected ISO 3166-1 alpha-2 code (or `OTHER`); empty when none. */
	value: string;
	onValueChange: (code: string) => void;
	/** Language of the country names. */
	locale?: string;
	disabled?: boolean;
	labels?: Partial<CountrySelectLabels>;
	className?: string;
};

/**
 * Picks a country by name, with its flag: type to search (« cote » finds « Côte d'Ivoire », a code
 * such as « ci » works too), African countries first. The value is the ISO code the API stores.
 */
function CountrySelect({
	id,
	ariaLabel,
	value,
	onValueChange,
	locale = "fr",
	disabled,
	labels,
	className,
}: CountrySelectProps) {
	const l = { ...FRENCH, ...labels };
	const options = useMemo(() => countryOptions(locale), [locale]);
	const selected = options.find((o) => o.value === value) ?? null;
	const [query, setQuery] = useState("");
	const shown = useMemo(
		() => filterCountries(options, query),
		[options, query],
	);
	const africa = shown.filter((o) => o.africa);
	const others = shown.filter((o) => !o.africa);

	return (
		<Combobox.Root<CountryOption>
			items={shown}
			value={selected}
			onValueChange={(next) => onValueChange(next?.value ?? "")}
			// Our own filter (accents, codes): the list is already narrowed.
			filter={null}
			onInputValueChange={(text, details) => {
				// Typing narrows the list; picking an item must not narrow it to that item.
				if (details.reason === "input-change") {
					setQuery(text);
				} else {
					setQuery("");
				}
			}}
			itemToStringLabel={(o) => o.label}
			isItemEqualToValue={(a, b) => a.value === b.value}
			disabled={disabled}
		>
			<Combobox.InputGroup
				className={cn(
					"relative flex h-8 w-full items-center rounded-md border border-input bg-transparent text-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50 data-[disabled]:opacity-50 dark:bg-input/30",
					className,
				)}
			>
				{selected && (
					<Flag
						code={selected.value}
						name={selected.label}
						className="ml-2.5"
					/>
				)}
				<Combobox.Input
					id={id}
					aria-label={ariaLabel}
					placeholder={l.placeholder}
					autoComplete="off"
					className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
				/>
				<Combobox.Clear
					aria-label={l.clear}
					className="flex h-full w-7 items-center justify-center text-muted-foreground hover:text-foreground"
				>
					<XIcon className="size-3.5" />
				</Combobox.Clear>
				<Combobox.Trigger
					aria-label={l.open}
					className="flex h-full w-7 items-center justify-center text-muted-foreground"
				>
					<ChevronDownIcon className="size-4" />
				</Combobox.Trigger>
			</Combobox.InputGroup>
			<Combobox.Portal>
				<Combobox.Positioner sideOffset={4} className="z-50 outline-none">
					<Combobox.Popup className="w-[var(--anchor-width)] max-w-[var(--available-width)] origin-[var(--transform-origin)] rounded-md border border-border bg-popover text-popover-foreground shadow-md transition-[scale,opacity] duration-100 data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
						<Combobox.Empty>
							<p className="px-3 py-4 text-muted-foreground text-sm">
								{l.empty}
							</p>
						</Combobox.Empty>
						<Combobox.List className="max-h-72 overflow-y-auto overscroll-contain py-1 outline-0">
							{[
								{ title: l.africa, items: africa },
								{ title: l.others, items: others },
							].map(
								(group) =>
									group.items.length > 0 && (
										<Combobox.Group key={group.title} items={group.items}>
											<Combobox.GroupLabel className="px-3 pt-2 pb-1 font-medium text-muted-foreground text-xs">
												{group.title}
											</Combobox.GroupLabel>
											<Combobox.Collection>
												{(option: CountryOption) => (
													<Combobox.Item
														key={option.value}
														value={option}
														className="grid cursor-default select-none grid-cols-[1.25rem_auto_1fr] items-center gap-2 px-3 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
													>
														<Combobox.ItemIndicator>
															<CheckIcon className="size-3.5" />
														</Combobox.ItemIndicator>
														<span className="col-start-2 flex">
															<Flag code={option.value} name={option.label} />
														</span>
														<span className="col-start-3 truncate">
															{option.label}
														</span>
													</Combobox.Item>
												)}
											</Combobox.Collection>
										</Combobox.Group>
									),
							)}
						</Combobox.List>
					</Combobox.Popup>
				</Combobox.Positioner>
			</Combobox.Portal>
		</Combobox.Root>
	);
}

export { CountrySelect, type CountrySelectLabels, type CountrySelectProps };
