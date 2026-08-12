import { useCallback, useEffect, useState } from "react";
import { getFavoriteVoices, addFavoriteVoice, removeFavoriteVoice } from "../services/api";

// DB-backed favorite voices (backend/src/models/FavoriteVoice.js), shared
// across the wizard, course video forms, and settings so a voice starred in
// one place shows starred everywhere.
export const useFavoriteVoices = () => {
  const [favoriteIds, setFavoriteIds] = useState([]);

  useEffect(() => {
    let cancelled = false;
    getFavoriteVoices()
      .then((res) => {
        if (!cancelled) setFavoriteIds(res.data?.favorites || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const isFavorite = useCallback((voiceId) => favoriteIds.includes(voiceId), [favoriteIds]);

  const toggleFavorite = useCallback(
    (voiceId) => {
      const wasFavorite = favoriteIds.includes(voiceId);
      // Optimistic update - revert on request failure.
      setFavoriteIds((prev) =>
        wasFavorite ? prev.filter((id) => id !== voiceId) : [...prev, voiceId]
      );

      const request = wasFavorite ? removeFavoriteVoice(voiceId) : addFavoriteVoice(voiceId);
      request
        .then((res) => {
          if (res.data?.favorites) setFavoriteIds(res.data.favorites);
        })
        .catch(() => {
          setFavoriteIds((prev) =>
            wasFavorite ? [...prev, voiceId] : prev.filter((id) => id !== voiceId)
          );
        });
    },
    [favoriteIds]
  );

  return { favoriteIds, isFavorite, toggleFavorite };
};

export default useFavoriteVoices;
