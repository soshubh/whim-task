-- Gmail-only sign-in (@gmail.com and @googlemail.com)
-- Cleans up any existing non-Gmail rows before adding constraints.

create or replace function public.is_gmail_address(email_input text)
returns boolean
language sql
immutable
as $$
  select lower(trim(email_input)) ~ '^[^\s@]+@(gmail|googlemail)\.com$';
$$;

-- Remove OTP rows for non-Gmail addresses
delete from public.otp_codes
where not public.is_gmail_address(email);

-- Remove auth users (and cascaded profile data) for non-Gmail addresses
delete from auth.users
where email is not null
  and not public.is_gmail_address(email);

alter table public.profiles
drop constraint if exists profiles_email_valid;

alter table public.otp_codes
drop constraint if exists otp_codes_email_valid;

alter table public.profiles
drop constraint if exists profiles_email_gmail;

alter table public.otp_codes
drop constraint if exists otp_codes_email_gmail;

alter table public.profiles
add constraint profiles_email_gmail check (public.is_gmail_address(email));

alter table public.otp_codes
add constraint otp_codes_email_gmail check (public.is_gmail_address(email));
