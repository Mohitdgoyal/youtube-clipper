"use client";
import Editor from "./(auth)/editor/editor";
import { Suspense } from "react";

export default function App() {
  return (
    <Suspense fallback={null}>
      <Editor />
    </Suspense>
  );
}
