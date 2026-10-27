-- 030_dog_meetup_enum.sql
-- Dog Meetups (social dog playdates) — step 1 of 5: the enum value ONLY.
--
-- PostgreSQL cannot use a newly added enum value in the same transaction that
-- adds it, so this file must be applied (and committed) BEFORE 031–034, which
-- reference 'dog_meetup'. Apply the files strictly in numeric order, each as
-- its own run (supabase db push does this by default).
--
-- Safe to re-run. Touches nothing else.

ALTER TYPE public.listing_type ADD VALUE IF NOT EXISTS 'dog_meetup';
