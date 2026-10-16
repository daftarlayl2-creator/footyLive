'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { readLocal, subscribeLocalValues, useLocalValue, writeLocal } from '@/lib/hooks/useLocalValue';
import {
  CHAT_ACTIVITY_STORAGE_KEY,
  RESULTS_STORAGE_KEY,
  computePredictionStats,
  fanLevel,
  mergeResult,
  parseChatActivity,
  parseResultCache,
  readDeviceVotes,
  resultFromApi,
  serializeResultCache,
  votesNeedingResults,
} from '@/lib/fanStats';

const FETCH_CONCURRENCY = 4;
const FAVORITES_SEPARATOR = '\u0001';
const noopSubscribe = () => () => {};

function votesSnapshot() {
  try {
    return JSON.stringify(readDeviceVotes(window.localStorage));
  } catch {
    return '[]';
  }
}

function favoritesSnapshot() {
  try {
    return `${window.localStorage.getItem('fav_teams') || '[]'}${FAVORITES_SEPARATOR}${window.localStorage.getItem('fav_team_details') || '{}'}`;
  } catch {
    return '';
  }
}

function subscribeFavorites(callback) {
  window.addEventListener('favorites-updated', callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener('favorites-updated', callback);
    window.removeEventListener('storage', callback);
  };
}

function parseFavorites(raw) {
  if (!raw) return [];
  const [namesRaw, detailsRaw] = raw.split(FAVORITES_SEPARATOR);
  try {
    const names = JSON.parse(namesRaw || '[]');
    const details = JSON.parse(detailsRaw || '{}') || {};
    if (!Array.isArray(names)) return [];
    const seen = new Set();
    return names
      .filter((name) => typeof name === 'string' && name.trim())
      .filter((name) => !seen.has(name.toLowerCase()) && seen.add(name.toLowerCase()))
      .map((name) => {
        const meta = details[name.toLowerCase()] || {};
        return { name, id: meta.id ?? null, badge: meta.badge || null };
      });
  } catch {
    return [];
  }
}

/**
 * Fan Stats for the profile: prediction accuracy (this device's votes
 * settled against final results fetched from /api/match/{id} and cached),
 * starred teams and chat activity. Updates live as votes, results, stars and
 * messages change in this or another tab.
 */
export default function useFanStats() {
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const votesJson = useSyncExternalStore(subscribeLocalValues, votesSnapshot, () => '[]');
  const resultsRaw = useLocalValue(RESULTS_STORAGE_KEY);
  const chatRaw = useLocalValue(CHAT_ACTIVITY_STORAGE_KEY);
  const favoritesRaw = useSyncExternalStore(subscribeFavorites, favoritesSnapshot, () => '');
  /** Votes snapshot whose results finished syncing. */
  const [syncedFor, setSyncedFor] = useState(null);

  const votes = useMemo(() => JSON.parse(votesJson), [votesJson]);
  const results = useMemo(() => parseResultCache(resultsRaw), [resultsRaw]);
  const chat = useMemo(() => parseChatActivity(chatRaw), [chatRaw]);
  const favorites = useMemo(() => parseFavorites(favoritesRaw), [favoritesRaw]);
  const predictions = useMemo(() => computePredictionStats(votes, results, { recentLimit: 5 }), [votes, results]);
  const level = useMemo(() => fanLevel(predictions, chat, favorites.length), [predictions, chat, favorites.length]);

  // Settle votes: fetch results for matches not known to be finished (bounded, 4 at a time).
  useEffect(() => {
    if (!hydrated) return undefined;
    let cancelled = false;
    const controller = new AbortController();

    const run = async () => {
      const ids = votesNeedingResults(JSON.parse(votesJson), parseResultCache(readLocal(RESULTS_STORAGE_KEY)), { now: Date.now() });
      let next = 0;
      const worker = async () => {
        while (!cancelled && next < ids.length) {
          const matchId = ids[next++];
          let result = null;
          try {
            const response = await fetch(`/api/match/${encodeURIComponent(matchId)}`, { cache: 'no-store', signal: controller.signal });
            if (response.status === 404) result = { status: 'unknown', checkedAt: Date.now() };
            else if (response.ok) result = resultFromApi(await response.json(), Date.now());
          } catch {
            result = null; // offline / aborted: try again on the next visit
          }
          if (cancelled || !result) continue;
          const cache = mergeResult(parseResultCache(readLocal(RESULTS_STORAGE_KEY)), matchId, result, Date.now());
          writeLocal(RESULTS_STORAGE_KEY, serializeResultCache(cache));
        }
      };
      await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, ids.length) }, worker));
      if (!cancelled) setSyncedFor(votesJson);
    };

    run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [hydrated, votesJson]);

  const syncing = hydrated && predictions.pending > 0 && syncedFor !== votesJson;
  // `votes` lets the wallet settle *every* call this fan has made, not just the
  // five shown in the recent list.
  return { hydrated, predictions, votes, chat, favorites, level, syncing };
}
