"use client";

import { useSyncExternalStore } from "react";

const TICK_MS = 30_000;
let currentNowMs = 0;

function subscribe(listener: () => void) {
  const timeout = window.setTimeout(() => {
    currentNowMs = Date.now();
    listener();
  }, 0);
  const interval = window.setInterval(() => {
    currentNowMs = Date.now();
    listener();
  }, TICK_MS);

  return () => {
    window.clearTimeout(timeout);
    window.clearInterval(interval);
  };
}

function getSnapshot() {
  return currentNowMs;
}

function getServerSnapshot() {
  return currentNowMs;
}

export function useNowMs() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
