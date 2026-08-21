-- Add the V1 public reaction value in its own migration. PostgreSQL may reject
-- using a newly added enum value before the transaction that added it commits.
alter type public.reaction_type add value if not exists 'like';
