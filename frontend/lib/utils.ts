import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


export const getVideoId = (url: string) => {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[7].length === 11 ? match[7] : null;
};

export const timeToSeconds = (timeStr: string): number => {
  if (!timeStr) return 0;

  const parts = timeStr.split(":");

  if (parts.length === 3) {
    // HH:MM:SS or HH:MM:SS.mmm
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  } else if (parts.length === 2) {
    // MM:SS or MM:SS.mmm
    return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  } else if (parts.length === 1) {
    // SS or SS.mmm
    return parseFloat(parts[0]);
  }

  return parseFloat(timeStr) || 0;
};

export const secondsToTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const pad = (num: number) => num.toString().padStart(2, "0");

  // Format as HH:MM:SS.mmm for precision matching backend
  return `${pad(h)}:${pad(m)}:${s.toFixed(3).padStart(6, '0')}`;
};

