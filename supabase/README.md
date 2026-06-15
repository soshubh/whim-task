# Supabase setup for Whim Task

## What this migration creates

| Area | Tables / storage |
|------|------------------|
| Profile | `profiles` + `avatars` storage bucket |
| Notification settings | `notification_settings` |
| Planner | `planner_days`, `planner_tasks` |
| Routines | `routines` |
| Reminders | `reminders` |
| Pomodoro | `pomodoro_timer_settings`, `pomodoro_sessions` |
| Daily updates | `daily_update_logs` |
| Gmail OTP (Brevo) | `otp_codes` (service-role only) |

## Apply the SQL

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**
2. Paste and run:
   - `supabase/migrations/20250615000000_initial_schema.sql`

Or with Supabase CLI:

```bash
supabase link --project-ref your-project-ref
supabase db push
```

## Auth provider settings (Supabase Dashboard)

In **Authentication → Providers**:

- **Email**: can stay enabled if you use Supabase Auth users created by your OTP edge function
- **Google**: **disable** (not used)
- **Phone / others**: disable anything you do not need

OTP delivery is **not** Supabase email — it goes through **Brevo** from your API / Edge Function using `BREVO_API_KEY`.

## Environment variables

Copy `.env.example` to `.env.local` and fill in values.

```bash
cp .env.example .env.local
```

## Avatar storage layout

Bucket: `avatars` (public read)

Upload path per user:

```text
avatars/{user_id}/avatar.jpg
avatars/{user_id}/avatar.png
```

After upload, store the path in `profiles.avatar_path` and the public URL in `profiles.avatar_url`.

## Brevo OTP flow (next step in app code)

1. `POST /api/auth/send-otp`
   - Validate Gmail
   - Generate 6-digit code
   - Save `code_hash` in `otp_codes` (use `crypt()` or SHA-256 server-side)
   - Send email via Brevo Transactional API

2. `POST /api/auth/verify-otp`
   - Verify hash + expiry in `otp_codes`
   - Create or fetch `auth.users` with service role (`email_confirm: true`)
   - Trigger `handle_new_user()` → profile + default settings
   - Return Supabase session to the client

## Email rule

Sign-in accepts **any valid email domain** (`you@example.com`, `you@gmail.com`, `you@gradright.com`, etc.).

Run migrations in order:

1. `20250615000000_initial_schema.sql`
2. `20250615000003_allow_any_email_domain.sql`

Skip `20250615000002_gmail_only.sql` unless you want Gmail-only.

Both `profiles.email` and `otp_codes.email` enforce a valid email format in SQL.
