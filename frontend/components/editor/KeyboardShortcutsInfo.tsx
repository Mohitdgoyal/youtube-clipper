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
                    <button className="text-muted-foreground hover:text-foreground transition-colors p-1" type="button">
                        <Info size={16} />
                    </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-popover text-popover-foreground border p-3 rounded-md shadow-md text-xs space-y-1">
                    <p className="font-semibold mb-2">Keyboard Shortcuts</p>
                    <div className="grid grid-cols-[30px_1fr] gap-x-2 gap-y-1 items-center">
                        <kbd className="bg-muted px-1 rounded text-center">Spc</kbd> <span>Play / Pause</span>
                        <kbd className="bg-muted px-1 rounded text-center">I</kbd> <span>Set Start Time</span>
                        <kbd className="bg-muted px-1 rounded text-center">O</kbd> <span>Set End Time</span>
                        <kbd className="bg-muted px-1 rounded text-center">←</kbd> <span>Seek -5s</span>
                        <kbd className="bg-muted px-1 rounded text-center">→</kbd> <span>Seek +5s</span>
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
