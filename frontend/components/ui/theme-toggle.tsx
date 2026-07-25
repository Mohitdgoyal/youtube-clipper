"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

function useIsClient() {
    return React.useSyncExternalStore(
        () => () => {},
        () => true,
        () => false
    );
}

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const mounted = useIsClient();

    if (!mounted) {
        return (
            <Button variant="ghost" size="icon" className="rounded-xl">
                <Sun className="h-5 w-5" />
            </Button>
        );
    }

    return (
        <Button
            variant="ghost"
            size="icon"
            className="rounded-xl"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
            {theme === "dark" ? (
                <Sun className="h-5 w-5 transition-transform" />
            ) : (
                <Moon className="h-5 w-5 transition-transform" />
            )}
            <span className="sr-only">Toggle theme</span>
        </Button>
    );
}
