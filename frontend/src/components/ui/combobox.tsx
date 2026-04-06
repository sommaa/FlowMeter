import * as React from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

/**
 * Props for the Combobox component.
 */
export interface ComboboxProps {
    /** Array of option strings to display */
    options: string[];
    /** Currently selected value */
    value: string;
    /** Callback when selection changes */
    onChange: (value: string) => void;
    /** Placeholder text when no value is selected (default: "Select...") */
    placeholder?: string;
    /** Additional CSS classes for the trigger button */
    className?: string;
    /** Message shown when search returns no results (default: "No option found.") */
    emptyMessage?: string;
}

/**
 * Searchable dropdown combobox for selecting from a list of options.
 *
 * A combination of a dropdown and search input, allowing users to filter
 * and select from a list of string options. Built with Popover, Button,
 * and a custom search input.
 *
 * Features:
 * - Live search filtering (case-insensitive)
 * - Check mark indicator for selected value
 * - Keyboard accessible (role="combobox", aria-expanded)
 * - Auto-focus on search input when opened
 * - Max height with scrolling for long lists (300px)
 * - Empty state message when no results match
 * - Truncates long option text
 *
 * The search filter uses useMemo for efficient re-filtering only when
 * options or search term changes.
 *
 * @example
 * ```tsx
 * <Combobox
 *   options={['Apple', 'Banana', 'Cherry', 'Date']}
 *   value={selectedFruit}
 *   onChange={setSelectedFruit}
 *   placeholder="Select a fruit"
 * />
 * ```
 *
 * @example
 * ```tsx
 * <Combobox
 *   options={columnNames}
 *   value={xAxisColumn}
 *   onChange={(col) => updateConfig({ xColumn: col })}
 *   emptyMessage="No columns found"
 * />
 * ```
 */
export function Combobox({
    options = [],
    value,
    onChange,
    placeholder = "Select...",
    className,
    emptyMessage = "No option found."
}: ComboboxProps) {
    const [open, setOpen] = React.useState(false)
    const [search, setSearch] = React.useState("")

    const filteredOptions = React.useMemo(() => {
        if (!search) return options;
        return options.filter(option =>
            option.toLowerCase().includes(search.toLowerCase())
        );
    }, [options, search]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-between h-9 px-3 font-normal overflow-hidden", !value && "text-muted-foreground", className)}
                >
                    <span className="truncate">{value || placeholder}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
                <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <input
                        className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder={placeholder}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        autoFocus
                    />
                </div>
                <div className="max-h-[300px] overflow-y-auto overflow-x-hidden p-1">
                    {filteredOptions.length === 0 ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                            {emptyMessage}
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {filteredOptions.map((option) => (
                                <div
                                    key={option}
                                    className={cn(
                                        "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                                        value === option && "bg-accent text-accent-foreground"
                                    )}
                                    onClick={() => {
                                        onChange(option)
                                        setOpen(false)
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === option ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <span className="truncate">{option}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}
