# Stock GA - Setup Guide

Follow these steps to get your inventory management system up and running with Supabase.

## 1. Supabase Project Setup
1. Create a new project at [Supabase](https://supabase.com).
2. Go to the **SQL Editor** in your Supabase dashboard.
3. Copy the contents of `supabase_setup.sql` from this project and run it. This will create all necessary tables, triggers, and RLS policies.

## 2. Storage Configuration
1. In the Supabase dashboard, go to **Storage**.
2. Create a new bucket named `item-photos`.
   - Set it to **Public**.
3. Create another bucket named `app-assets`.
   - Set it to **Public**.

## 3. Environment Variables
1. In your Supabase project, go to **Project Settings** > **API**.
2. Copy your **Project URL** and **anon public API key**.
3. In AI Studio, add these to your environment variables (Secrets):
   - `VITE_SUPABASE_URL`: Your project URL.
   - `VITE_SUPABASE_ANON_KEY`: Your anon public key.

## 4. Authentication
1. Go to **Authentication** > **Providers**.
2. Ensure **Email** is enabled.
3. (Optional) Disable "Confirm Email" if you want to test immediately without email verification.

## 5. User Roles
By default, new users are assigned the `user` role. To perform administrative actions (like adding/editing items), you need to manually change your role to `admin` in the `profiles` table:
1. Go to **Table Editor** > `profiles`.
2. Find your user ID and change the `role` column to `admin`.

## 6. App Customization
You can customize the app title, logo, and colors by editing the `app_settings` table in Supabase.

---
Enjoy your professional Stock GA System!
