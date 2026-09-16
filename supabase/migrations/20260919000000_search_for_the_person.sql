-- search_library_v4 runs as the person searching: search-library passes their JWT, so RLS and
-- auth.uid() scope every search to their own library. The stage-B migration granted v4 to
-- service_role alone — the sweeper's pattern, copied by mistake where v3 had authenticated —
-- and every search has answered 500 since. v3's grant, on v4.
grant execute on function public.search_library_v4(text,extensions.vector,text[],text[],text[],text[],text[],jsonb,int) to authenticated;
