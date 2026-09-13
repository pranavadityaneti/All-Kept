-- A storefront is stored as ISO 3166-1 alpha-2, or not at all.
--
-- Apple's store names a country with three letters (USA, IND) and Google's with two, and the
-- free-region rule in entitled() is written in two. The phone now translates before reporting;
-- this refuses any other shape at the door, so a code the rule cannot read can never be stored —
-- and a refused report leaves the column null, which the server does not gate. A wrong-shaped
-- code can never charge anyone. The one three-letter row that got in before this is cleared;
-- the phone reports it again, in two letters, on its next foreground.
update public.profiles set storefront = null, storefront_at = null where storefront !~ '^[A-Z]{2}$';
alter table public.profiles add constraint profiles_storefront_alpha2 check (storefront is null or storefront ~ '^[A-Z]{2}$');
