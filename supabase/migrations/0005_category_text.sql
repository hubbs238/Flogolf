-- ============================================================
--  Editable category helper text
--
--  The label was always editable in the database; the admin screen just did
--  not expose it. The helper line under each slider on the rating form was
--  hardcoded in React and keyed on the category key, so renaming Accuracy to
--  Consistency would have left "Fairways and greens" sitting underneath it.
--  Moving that copy into the table makes the whole category yours to edit.
--
--  Safe to run more than once.
-- ============================================================

alter table public.characteristics
  add column if not exists description text;

-- Seed the five originals with the text that used to live in the component.
update public.characteristics set description =
  'Off the tee. How far, and can they carry trouble?'
  where key = 'distance' and description is null;

update public.characteristics set description =
  'Inside 30 feet. Do they make the ones that matter?'
  where key = 'putting' and description is null;

update public.characteristics set description =
  'Chips, pitches, bunkers. Getting up and down.'
  where key = 'short_game' and description is null;

update public.characteristics set description =
  'Fairways and greens. How often are they in play?'
  where key = 'accuracy' and description is null;

update public.characteristics set description =
  'The pressure shot with the match on the line.'
  where key = 'clutch' and description is null;

select key, label, description, weight, active
from public.characteristics
order by sort_order;
