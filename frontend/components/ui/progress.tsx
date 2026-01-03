import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
    value?: number;
}

export function Progress({ className, value, ...props }: ProgressProps) {
    return (
        <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-secondary/50", className)} {...props}>
            <div
                className="h-full bg-primary transition-all duration-300 ease-in-out rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, value || 0))}%` }}
            />
        </div>
    );
}
