-- The Pinterest saves settled before enrichment took the pin's oEmbed.
--
-- A pin's page is over a megabyte and Pinterest writes its preview tags at the end of it, past what
-- the page route reads, so every pin settled as "no preview" with no picture and no title, final.
-- Enrichment now asks the pin's oEmbed, which answers with all three. These saves are put back on
-- the preview retry every settled card without a picture already has: the next sweep enriches them
-- again, and the patch fills only what is missing. Deploy the sweeper before applying this, or the
-- sweep runs the old route and settles them once more.
update public.items set next_attempt_at = now(), enrich_attempts = 0
where platform = 'pinterest' and status in ('ready', 'preview_unavailable')
  and thumbnail_path is null and thumbnail_url_remote is null;
