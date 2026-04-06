/**
 * Common UI Components
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle, X } from 'lucide-react';

// ========== Debounce =============
export { DebouncedInput, DebouncedTextArea, DebouncedColorPicker } from './debounce';
export { CustomColorPicker } from './CustomColorPicker';
export { useDebounce } from '@/hooks/use-debounce';

// ========== Logo =============
import { Logo } from './Logo';
import { SettingsMenu } from './SettingsMenu';
import { NumberInput } from '../ui/number-input';
export { Logo, SettingsMenu, NumberInput };

// ============= Button =============
export { Button, type ButtonProps } from './Button';
export { ErrorBoundary } from './ErrorBoundary';
export { SimpleTooltip } from './SimpleTooltip';

// ============= Card =============

import { Card as ShadcnCard } from "@/components/ui/card";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className, hover = false }) => {
  return (
    <ShadcnCard
      className={cn(
        'bg-card text-card-foreground',
        hover && 'hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200',
        className
      )}
    >
      {children}
    </ShadcnCard>
  );
};

// ============= Input =============

import { Input as ShadcnInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export { Checkbox };

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ label, error, className, ...props }, ref) => {
  return (
    <div className="w-full space-y-1">
      {label && <Label>{label}</Label>}
      <ShadcnInput
        ref={ref}
        className={cn(
          error && 'border-destructive focus-visible:ring-destructive',
          className
        )}
        {...props}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
});
Input.displayName = "Input";

// ============= Select =============

import {
  Select as ShadcnSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'dir' | 'defaultValue'> {
  label?: string;
  options: { value: string; label: string }[];
  onChange?: (e: any) => void;
  value?: string;
}

export const Select: React.FC<SelectProps> = ({ label, options, className, value, onChange, disabled, ...props }) => {
  // Extract props that belong to Root vs Trigger
  const { name, required, form, ...triggerProps } = props as any;

  return (
    <div className="w-full space-y-1">
      {label && <Label>{label}</Label>}
      <ShadcnSelect
        value={value}
        onValueChange={(val) => onChange?.({ target: { value: val } })}
        disabled={disabled}
        name={name}
        required={required}
      >
        <SelectTrigger className={cn(className)} {...triggerProps}>
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </ShadcnSelect>
    </div>
  );
};

// ============= SearchableSelect =============

interface SearchableSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'dir' | 'defaultValue'> {
  label?: string;
  options: { value: string; label: string }[];
  onChange?: (e: any) => void;
  value?: string;
  placeholder?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label,
  options,
  className,
  value,
  onChange,
  disabled,
  placeholder = "Search...",
  ...props
}) => {
  const [search, setSearch] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Filter options based on search
  const filteredOptions = React.useMemo(() => {
    if (!search) return options;
    const searchLower = search.toLowerCase();
    return options.filter(opt =>
      opt.label.toLowerCase().includes(searchLower) ||
      opt.value.toLowerCase().includes(searchLower)
    );
  }, [options, search]);

  // Get the current selected label
  const selectedLabel = React.useMemo(() => {
    const selected = options.find(opt => opt.value === value);
    return selected?.label || placeholder;
  }, [options, value, placeholder]);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle option selection
  const handleSelect = (optValue: string) => {
    onChange?.({ target: { value: optValue } });
    setIsOpen(false);
    setSearch('');
  };

  // Extract props that don't belong on divs
  const { name, required, form, ...restProps } = props as any;

  return (
    <div className={cn('w-full space-y-1', className)} ref={containerRef} {...restProps}>
      {label && <Label>{label}</Label>}
      <div className="relative">
        {/* Trigger button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background",
            "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "[&>span]:line-clamp-1"
          )}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {selectedLabel}
          </span>
          <svg
            className={cn("h-4 w-4 transition-transform opacity-100 text-foreground", isOpen && "rotate-180")}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute z-[var(--z-dropdown)] mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
            {/* Search input */}
            <div className="p-2 border-b">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={placeholder}
                className="w-full h-8 px-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
            </div>
            {/* Options list */}
            <div className="max-h-60 overflow-y-auto p-1 scrollbar-thin">
              {filteredOptions.length === 0 ? (
                <div className="px-2 py-4 text-sm text-center text-muted-foreground">
                  No results found
                </div>
              ) : (
                filteredOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={cn(
                      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none",
                      "hover:bg-accent hover:text-accent-foreground",
                      "focus:bg-accent focus:text-accent-foreground",
                      value === opt.value && "bg-accent/50"
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    {value === opt.value && (
                      <svg className="ml-auto h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============= MultiSelect =============
// Keeping custom implementation but fixing styles to match Shadcn
// (Shadcn doesn't have a core MultiSelect, usually typically popover+checkboxes)

interface MultiSelectProps {
  label?: string;
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
}

export const MultiSelect: React.FC<MultiSelectProps> = ({
  label,
  options,
  value,
  onChange,
  className,
}) => {
  const toggleOption = (option: string) => {
    if (value.includes(option)) {
      onChange(value.filter((v) => v !== option));
    } else {
      onChange([...value, option]);
    }
  };

  return (
    <div className={cn('w-full space-y-1', className)}>
      {label && <Label>{label}</Label>}
      <div className="max-h-40 overflow-y-auto border rounded-md p-2 bg-background scrollbar-thin">
        {options.map((option) => (
          <label
            key={option}
            className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm"
          >
            <Checkbox
              checked={value.includes(option)}
              onChange={() => toggleOption(option)}
              className="border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
            <span className="break-all" title={option}>{option}</span>
          </label>
        ))}
      </div>
      {value.length > 0 && (
        <div className="mt-1 flex justify-between items-center text-xs text-muted-foreground">
          <span>{value.length} selected</span>
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-xs text-primary hover:text-primary/80 hover:underline focus:outline-none"
          >
            Deselect All
          </button>
        </div>
      )}
    </div>
  );
};

// ============= TextArea =============

import { Textarea as ShadcnTextarea } from "@/components/ui/textarea";

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export const TextArea: React.FC<TextAreaProps> = ({ label, className, ...props }) => {
  return (
    <div className="w-full space-y-1">
      {label && <Label>{label}</Label>}
      <ShadcnTextarea
        className={cn(
          'resize-none',
          className
        )}
        {...props}
      />
    </div>
  );
};

// ============= Alert =============

interface AlertProps {
  type: 'success' | 'warning' | 'error' | 'info';
  message: string;
  onClose?: () => void;
}

export const Alert: React.FC<AlertProps> = ({ type, message, onClose }) => {
  const styles = {
    success: 'bg-gradient-to-r from-emerald-50 to-emerald-100/50 dark:from-emerald-900/30 dark:to-emerald-900/10 border-emerald-200/80 dark:border-emerald-700/50 text-emerald-800 dark:text-emerald-200',
    warning: 'bg-gradient-to-r from-amber-50 to-amber-100/50 dark:from-amber-900/30 dark:to-amber-900/10 border-amber-200/80 dark:border-amber-700/50 text-amber-800 dark:text-amber-200',
    error: 'bg-gradient-to-r from-red-50 to-red-100/50 dark:from-red-900/30 dark:to-red-900/10 border-red-200/80 dark:border-red-700/50 text-red-800 dark:text-red-200',
    info: 'bg-gradient-to-r from-cyan-50 to-cyan-100/50 dark:from-cyan-900/30 dark:to-cyan-900/10 border-cyan-200/80 dark:border-cyan-700/50 text-cyan-800 dark:text-cyan-200',
  };

  const iconStyles = {
    success: 'bg-emerald-100 dark:bg-emerald-800/40 text-emerald-600 dark:text-emerald-300',
    warning: 'bg-amber-100 dark:bg-amber-800/40 text-amber-600 dark:text-amber-300',
    error: 'bg-red-100 dark:bg-red-800/40 text-red-600 dark:text-red-300',
    info: 'bg-cyan-100 dark:bg-cyan-800/40 text-cyan-600 dark:text-cyan-300',
  };

  const icons = {
    success: <CheckCircle className="w-4 h-4" />,
    warning: <AlertCircle className="w-4 h-4" />,
    error: <AlertCircle className="w-4 h-4" />,
    info: <AlertCircle className="w-4 h-4" />,
  };

  return (
    <div className={cn('p-4 rounded-xl border flex items-center gap-3 elevation-2', styles[type])}>
      <div className={cn('p-2 rounded-lg', iconStyles[type])}>
        {icons[type]}
      </div>
      <span className="flex-1 font-medium">{message}</span>
      {onClose && (
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

// ============= Loading =============

export const Loading: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const pixelSizes = {
    sm: 24,
    md: 48,
    lg: 80,
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 gap-3 animate-in fade-in duration-300">
      <div className="relative flex items-center justify-center">
        {/* Subtle backing glow */}
        <div className="absolute inset-0 bg-primary blur-2xl opacity-10 animate-pulse rounded-full" />
        <Logo
          size={pixelSizes[size]}
          className="text-primary animate-pulse"
        />
      </div>
    </div>
  );
};

// ============= Divider =============

export const Divider: React.FC<{ className?: string }> = ({ className }) => {
  return <hr className={cn('separator-depth my-4', className)} />
};

