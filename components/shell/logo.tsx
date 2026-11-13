import { cn } from "@/lib/utils";

/** Vigilo mark: a double chevron, read as a "V" and as a watchful eyelid. */
export function VigiloMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-6 w-6", className)} aria-hidden>
      <path d="M2.5 4.5h4.6L12 12.9l4.9-8.4h4.6L12 20.5z" fill="hsl(var(--primary))" />
      <path d="M8.6 4.5h2.5l.9 1.6.9-1.6h2.5L12 10.2z" fill="hsl(var(--cyan))" />
    </svg>
  );
}

export function VigiloWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display text-[17px] font-extrabold tracking-tight", className)}>Vigilo</span>
  );
}
