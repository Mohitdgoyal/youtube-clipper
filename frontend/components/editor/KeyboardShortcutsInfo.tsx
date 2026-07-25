import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";

export function KeyboardShortcutsInfo() {
    return (
        <TooltipProvider>
            <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                    <button
                        className="rounded-xl p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        type="button"
                        aria-label="Keyboard shortcuts"
                    >
                        <Info size={16} />
                    </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="z-50 space-y-1 rounded-xl border border-border/80 bg-popover p-3 text-xs text-popover-foreground shadow-lg">
                    <p className="mb-2 font-semibold">Shortcuts</p>
                    <div className="grid grid-cols-[36px_1fr] items-center gap-x-2 gap-y-1.5">
                        <kbd className="rounded bg-muted px-1 text-center font-mono">Spc</kbd> <span>Play / pause</span>
                        <kbd className="rounded bg-muted px-1 text-center font-mono">I</kbd> <span>Set start</span>
                        <kbd className="rounded bg-muted px-1 text-center font-mono">O</kbd> <span>Set end</span>
                        <kbd className="rounded bg-muted px-1 text-center font-mono">←</kbd> <span>Seek −5s</span>
                        <kbd className="rounded bg-muted px-1 text-center font-mono">→</kbd> <span>Seek +5s</span>
                        <kbd className="rounded bg-muted px-1 text-center font-mono">⇧←</kbd> <span>Seek −0.05s</span>
                        <kbd className="rounded bg-muted px-1 text-center font-mono">⇧→</kbd> <span>Seek +0.05s</span>
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
