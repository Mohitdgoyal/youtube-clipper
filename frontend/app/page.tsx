import { Suspense } from "react";
import Editor from "./(app)/editor/editor";

function EditorFallback() {
  return (
    <main className="flex min-h-screen w-full flex-col">
      <div className="h-14 border-b border-border/60 bg-background/70" />
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-4 py-14">
        <div className="h-14 w-40 animate-pulse rounded-lg bg-muted/50" />
        <div className="h-5 w-72 max-w-full animate-pulse rounded bg-muted/40" />
        <div className="mt-4 h-48 w-full animate-pulse rounded-3xl bg-muted/40" />
      </div>
    </main>
  );
}

export default function App() {
  return (
    <Suspense fallback={<EditorFallback />}>
      <Editor />
    </Suspense>
  );
}
