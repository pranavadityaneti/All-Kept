-- A note that is only a link is not a note.
--
-- The share sheet hands the server the cleaned link and, separately, the raw text it arrived in,
-- which is usually that same link before cleaning: a tracking tail, a redirect wrapper, a slug or a
-- trailing slash the cleaned one lacks. The save path kept any text that differed from the cleaned
-- link as "the user's own words", so 32 saves carried their own address as a note. The path now
-- keeps only the words left once every link is taken out; this clears what it left behind. The
-- search index follows on its own: it refreshes on any update of note.
update public.items set note = null where note ~ '^\s*https?://\S+\s*$';
