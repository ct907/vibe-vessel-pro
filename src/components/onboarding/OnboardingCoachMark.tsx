import { X } from "lucide-react";

interface Props {
  step: string;
  message: string;
  onDismiss?: () => void;
}

export function OnboardingCoachMark({ step, message, onDismiss }: Props) {
  return (
    <div className="fixed bottom-14 left-0 right-0 z-40 pointer-events-none">
      <div className="max-w-6xl mx-auto px-4">
        <div
          className="pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg"
          style={{
            background: "color-mix(in oklch, var(--paper-card) 96%, transparent)",
            border: "1px solid color-mix(in oklch, var(--border) 70%, transparent)",
            boxShadow: "var(--shadow-card)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        >
          <span
            className="shrink-0 inline-flex items-center justify-center rounded-full font-mono-chord font-bold text-[11px] h-6 px-2"
            style={{
              background: "var(--primary)",
              color: "var(--primary-foreground)",
              minWidth: "2.5rem",
            }}
          >
            {step}
          </span>
          <p
            className="flex-1 text-sm"
            style={{ fontFamily: "var(--font-ui, 'Nunito', sans-serif)", color: "var(--ink)", fontWeight: 600 }}
          >
            {message}
          </p>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="btn-sculpt-amber shrink-0 inline-flex items-center gap-1 rounded-lg px-3 h-7 text-xs font-semibold"
              aria-label="Dismiss tip"
            >
              Got it <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
