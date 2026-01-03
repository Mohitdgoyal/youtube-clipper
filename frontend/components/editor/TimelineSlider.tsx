import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn, timeToSeconds, secondsToTime } from "@/lib/utils";

interface TimelineSliderProps {
    duration: number;
    startTime: string;
    endTime: string;
    onValueChange: (start: string, end: string) => void;
    className?: string;
}

export const TimelineSlider = React.forwardRef<
    React.ElementRef<typeof SliderPrimitive.Root>,
    TimelineSliderProps
>(({ className, duration, startTime, endTime, onValueChange, ...props }, ref) => {
    const startSec = timeToSeconds(startTime);
    const endSec = timeToSeconds(endTime);
    // Ensure we don't crash if duration is 0 or invalid
    const safeDuration = duration > 0 ? duration : 100;

    const value = [
        Math.min(startSec, safeDuration),
        Math.min(Math.max(endSec, startSec), safeDuration)
    ];

    const handleValueChange = (newValue: number[]) => {
        onValueChange(secondsToTime(newValue[0]), secondsToTime(newValue[1]));
    };

    return (
        <SliderPrimitive.Root
            ref={ref}
            className={cn(
                "relative flex w-full touch-none select-none items-center cursor-pointer group",
                className
            )}
            min={0}
            max={safeDuration}
            step={1}
            value={value}
            onValueChange={handleValueChange}
            {...props}
        >
            <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary/50">
                <SliderPrimitive.Range className="absolute h-full bg-primary data-[disabled]:bg-primary/50" />
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb className="block h-5 w-3 rounded-sm border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent z-20" />
            <SliderPrimitive.Thumb className="block h-5 w-3 rounded-sm border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent z-20" />
        </SliderPrimitive.Root>
    );
});
TimelineSlider.displayName = "TimelineSlider";
