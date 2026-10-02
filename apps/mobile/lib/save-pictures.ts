import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { useThumbnails } from "./thumbnails";

/**
 * Pictures for saves known only by id — a trip in Your trips, a stop in a plan: each save's
 * thumbnail, looked up once for the set and signed like every other thumbnail. A save without one,
 * or one not loaded yet, has no entry, and the screen draws its own stand-in.
 */
export function useSavePictures(ids: (string | null | undefined)[]): Record<string, string | undefined> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))].sort();
  const rows = useQuery({
    queryKey: ["save-pictures", wanted.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("id,thumbnail_path").in("id", wanted);
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; thumbnail_path: string | null }[];
    },
    enabled: wanted.length > 0,
    staleTime: 5 * 60_000,
  });
  const urls = useThumbnails((rows.data ?? []).map((r) => r.thumbnail_path));
  const out: Record<string, string | undefined> = {};
  for (const r of rows.data ?? []) out[r.id] = r.thumbnail_path ? urls[r.thumbnail_path] : undefined;
  return out;
}
