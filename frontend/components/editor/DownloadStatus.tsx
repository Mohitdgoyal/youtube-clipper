import { motion, AnimatePresence } from "motion/react";

interface DownloadStatusProps {
    count: number;
}

export default function DownloadStatus({ count }: DownloadStatusProps) {
    return (
        <AnimatePresence mode="wait">
            {count > 0 && (
                <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="text-center text-sm text-muted-foreground"
                >
                    <span className="font-medium text-foreground">{count}</span>
                    {" "}
                    clip{count === 1 ? "" : "s"} downloaded total
                </motion.p>
            )}
        </AnimatePresence>
    );
}
