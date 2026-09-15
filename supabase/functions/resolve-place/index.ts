// POST { itemId, name, locality } — a place the person names for a save, looked up on the spot
// and kept against every re-sort; POST { itemId, clear: true } takes it away. See handler.ts.
import { adminClient, userIdFromRequest } from "../_shared/supabase.ts";
import { apiError } from "../_shared/http.ts";
import { resolveVenue } from "../_shared/places.ts";
import { providersFromEnv } from "../_shared/place-providers.ts";
import { safeFetch } from "../_shared/safe-address.ts";
import { handleResolvePlace } from "./handler.ts";

Deno.serve(async (req) => {
  try {
    const db = adminClient();
    const providers = providersFromEnv((n) => Deno.env.get(n), safeFetch(fetch));
    return await handleResolvePlace(req, {
      userId: userIdFromRequest,
      // Service role bypasses row-level security, so ownership is checked here, by the caller's id.
      async owned(userId, itemId) {
        const { data, error } = await db.from("items").select("id").eq("id", itemId).eq("user_id", userId).maybeSingle();
        if (error) throw error;
        return !!data;
      },
      resolve: (venue) => resolveVenue(venue, { apple: providers.apple ?? (async () => []), google: providers.google }),
      async write(itemId, venue, place, miss) {
        const { error } = await db.rpc("user_venue_set", { p_item_id: itemId, p_venue: venue, p_miss: miss });
        if (error) throw error;
        if (place) {
          const { error: e2 } = await db.rpc("place_resolved", {
            p_item_id: itemId, p_provider: place.provider, p_provider_id: place.providerId, p_name: place.name, p_address: place.address, p_locality: place.locality,
            p_lat: place.lat, p_lng: place.lng, p_category: place.category, p_hours: place.hours, p_status: place.status, p_url: place.url,
          });
          if (e2) throw e2;
        }
      },
      async clear(itemId) {
        const { error } = await db.rpc("user_venue_clear", { p_item_id: itemId });
        if (error) throw error;
      },
    });
  } catch (e) {
    console.error("resolve-place failed", e);
    return apiError("internal", "could not look that place up");
  }
});
