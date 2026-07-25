import { Suspense } from "react";
import Editor from "./(auth)/editor/editor";

function EditorFallback() {
  return (
    <main className="flex flex-col w-full min-h-screen p-4 max-w-3xl mx-auto items-center justify-center">
      <div className="w-full max-w-xl aspect-video rounded-xl bg-muted/40 animate-pulse" />
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
