-- Do not expose arrival points whose exact safe entrance has not been checked
-- on site. Existing rows remain available for audit and can be reactivated
-- individually after their coordinates are verified.
update public.public_spots
set active = false
where id in (
  '40000000-0000-4000-8000-000000000004',
  '40000000-0000-4000-8000-000000000005',
  '50000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000004',
  '50000000-0000-4000-8000-000000000005'
);
