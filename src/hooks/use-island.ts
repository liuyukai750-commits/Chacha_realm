"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addComment,
  changeRegion,
  createInitialState,
  createPost,
  eatPost,
  IslandState,
  joinIsland,
  PostCategory,
  Region,
} from "@/lib/island-model";

const storageKey = "chacha-island:v1";

function isIslandState(value: unknown): value is IslandState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<IslandState>;
  return state.version === 1 && Array.isArray(state.posts) && Array.isArray(state.comments);
}

export function useIsland() {
  const [state, setState] = useState<IslandState>(() => createInitialState());
  const [isReady, setIsReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isIslandState(parsed)) setState(parsed);
      }
    } catch {
      setStorageError("没有读到上次的瓜田，本次浏览仍可继续。请检查浏览器是否禁用了本地存储。");
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    if (!isReady) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
      setStorageError(null);
    } catch {
      setStorageError("这次变化暂时没有保存，关闭页面后可能丢失。请释放浏览器存储空间后再试。");
    }
  }, [isReady, state]);

  const join = useCallback((region: Region) => setState((current) => joinIsland(current, region)), []);
  const selectRegion = useCallback((region: Region) => setState((current) => changeRegion(current, region)), []);
  const publish = useCallback(
    (input: { title: string; content: string; category: PostCategory }) =>
      setState((current) => createPost(current, input)),
    [],
  );
  const eat = useCallback((postId: string) => setState((current) => eatPost(current, postId)), []);
  const comment = useCallback(
    (postId: string, content: string) => setState((current) => addComment(current, postId, content)),
    [],
  );

  return { state, isReady, storageError, join, selectRegion, publish, eat, comment };
}
