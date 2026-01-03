import { motion, AnimatePresence } from "motion/react";

interface DownloadStatusProps {
    count: number;
}

export default function DownloadStatus({ count }: DownloadStatusProps) {
    return (
        <AnimatePresence mode="wait">
            {count > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="text-center mt-4 text-sm text-muted-foreground"
                >
                    🔥 {count} banger{count > 1 && "s"} clipped
                </motion.div>
            )}
        </AnimatePresence>
    );
}
