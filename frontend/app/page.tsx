"use client";
import Editor from "./(auth)/editor/editor";
import { useEffect, useState } from "react";

export default function App() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return <Editor />;
}
