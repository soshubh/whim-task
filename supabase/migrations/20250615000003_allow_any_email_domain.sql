-- Allow sign-in from any email domain (not Gmail-only).
-- Safe to run even if Gmail-only constraints were applied before.

create or replace function public.is_valid_email(email_input text)
returns boolean
language sql
immutable
as $$
  select lower(trim(email_input)) ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$';
$$;

alter table public.profiles
drop constraint if exists profiles_email_gmail;

alter table public.otp_codes
drop constraint if exists otp_codes_email_gmail;

alter table public.profiles
drop constraint if exists profiles_email_valid;

alter table public.otp_codes
drop constraint if exists otp_codes_email_valid;

alter table public.profiles
add constraint profiles_email_valid check (public.is_valid_email(email));

alter table public.otp_codes
add constraint otp_codes_email_valid check (public.is_valid_email(email));
