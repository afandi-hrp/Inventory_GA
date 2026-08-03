# Supabase Setup SQL

-- 1. Create Tables (if not exists)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama_lokasi TEXT NOT NULL UNIQUE,
  deskripsi TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama_kategori TEXT NOT NULL UNIQUE,
  deskripsi TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_barang TEXT UNIQUE NOT NULL,
  nama_barang TEXT NOT NULL,
  jumlah_barang INTEGER DEFAULT 0,
  lokasi TEXT,
  kode_lokasi TEXT,
  foto_urls TEXT[] DEFAULT '{}',
  deskripsi TEXT,
  note_audit TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Migration: Add foto_urls if it doesn't exist and remove old foto_url
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='items' AND column_name='foto_urls') THEN
        ALTER TABLE items ADD COLUMN foto_urls TEXT[] DEFAULT '{}';
    END IF;
    
    -- Optional: Migrate data from old column if it exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='items' AND column_name='foto_url') THEN
        UPDATE items SET foto_urls = ARRAY[foto_url] WHERE foto_url IS NOT NULL AND (foto_urls IS NULL OR foto_urls = '{}');
        ALTER TABLE items DROP COLUMN foto_url;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='items' AND column_name='kode_lokasi') THEN
        ALTER TABLE items ADD COLUMN kode_lokasi TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='items' AND column_name='note_audit') THEN
        ALTER TABLE items ADD COLUMN note_audit TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='items' AND column_name='kategori_id') THEN
        ALTER TABLE items ADD COLUMN kategori_id UUID REFERENCES categories(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_keluar_history' AND column_name='lokasi_keluar') THEN
        ALTER TABLE stock_keluar_history ADD COLUMN lokasi_keluar TEXT;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Take Item History Table
CREATE TABLE IF NOT EXISTS take_item_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  kode_barang TEXT,
  nama_barang TEXT,
  jumlah INTEGER NOT NULL,
  kode_lokasi TEXT,
  nama_lokasi TEXT,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_name TEXT,
  alasan TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Item Audit Logs Table
CREATE TABLE IF NOT EXISTS item_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE take_item_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. DROP EXISTING POLICIES TO AVOID CONFLICTS
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile." ON profiles;
DROP POLICY IF EXISTS "Authenticated users can view locations" ON locations;
DROP POLICY IF EXISTS "Admins can manage locations" ON locations;
DROP POLICY IF EXISTS "Authenticated users can view items" ON items;
DROP POLICY IF EXISTS "Admins can manage items" ON items;
DROP POLICY IF EXISTS "Admins can insert items" ON items;
DROP POLICY IF EXISTS "Admins can update items" ON items;
DROP POLICY IF EXISTS "Admins can delete items" ON items;
DROP POLICY IF EXISTS "Public can view settings" ON app_settings;
DROP POLICY IF EXISTS "Admins can manage settings" ON app_settings;
DROP POLICY IF EXISTS "Authenticated users can view history" ON take_item_history;
DROP POLICY IF EXISTS "Admins can view audit logs" ON item_audit_logs;

-- 4. RECREATE POLICIES

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles
CREATE POLICY "Public profiles are viewable by everyone." ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile." ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile." ON profiles FOR UPDATE USING (auth.uid() = id);

-- Locations
CREATE POLICY "Authenticated users can view locations" ON locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage locations" ON locations FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Categories
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view categories" ON categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage categories" ON categories FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Items
CREATE POLICY "Authenticated users can view items" ON items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage items" ON items FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Take Item History
CREATE POLICY "Authenticated users can view history" ON take_item_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert history" ON take_item_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Item Audit Logs
CREATE POLICY "Admins can view audit logs" ON item_audit_logs FOR SELECT TO authenticated USING (is_admin());

-- Force all existing users to admin for testing
UPDATE profiles SET role = 'admin';

-- Ensure authenticated users have necessary permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- App Settings
CREATE POLICY "Public can view settings" ON app_settings FOR SELECT USING (true);
CREATE POLICY "Admins can manage settings" ON app_settings FOR ALL TO authenticated USING (
  COALESCE((SELECT role FROM profiles WHERE id = auth.uid()), 'user') = 'admin'
);

-- 5. STORAGE POLICIES (Run these in SQL Editor)
-- Ensure buckets exist first
INSERT INTO storage.buckets (id, name, public) VALUES ('item-photos', 'item-photos', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('app-assets', 'app-assets', true) ON CONFLICT (id) DO NOTHING;

-- Policies for item-photos
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'item-photos');
CREATE POLICY "Admin Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'item-photos' AND COALESCE((SELECT role FROM profiles WHERE id = auth.uid()), 'user') = 'admin');
CREATE POLICY "Admin Update" ON storage.objects FOR UPDATE USING (bucket_id = 'item-photos' AND COALESCE((SELECT role FROM profiles WHERE id = auth.uid()), 'user') = 'admin');
CREATE POLICY "Admin Delete" ON storage.objects FOR DELETE USING (bucket_id = 'item-photos' AND COALESCE((SELECT role FROM profiles WHERE id = auth.uid()), 'user') = 'admin');

-- Policies for app-assets
CREATE POLICY "Public Assets Access" ON storage.objects FOR SELECT USING (bucket_id = 'app-assets');
CREATE POLICY "Admin Assets Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'app-assets' AND COALESCE((SELECT role FROM profiles WHERE id = auth.uid()), 'user') = 'admin');

-- 6. TRIGGER FOR NEW USER (Ensure it exists and is correct)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, role)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', new.email), 
    new.raw_user_meta_data->>'avatar_url', 
    'admin'
  )
  ON CONFLICT (id) DO UPDATE SET role = 'admin';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. TRIGGER FOR ITEM AUDIT LOGS
CREATE OR REPLACE FUNCTION public.log_item_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    -- Skip logging if only note_audit and updated_at were changed
    IF (to_jsonb(OLD) - 'note_audit' - 'updated_at') = (to_jsonb(NEW) - 'note_audit' - 'updated_at') THEN
      RETURN NULL;
    END IF;

    INSERT INTO public.item_audit_logs (item_id, action, old_values, new_values, changed_by)
    VALUES (
      NEW.id,
      'UPDATE',
      to_jsonb(OLD),
      to_jsonb(NEW),
      COALESCE(auth.uid(), NULL)
    );
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.item_audit_logs (item_id, action, old_values, changed_by)
    VALUES (
      NULL,
      'DELETE',
      to_jsonb(OLD),
      COALESCE(auth.uid(), NULL)
    );
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

DROP TRIGGER IF EXISTS on_item_changed ON items;
CREATE TRIGGER on_item_changed
  AFTER UPDATE OR DELETE ON items
  FOR EACH ROW EXECUTE PROCEDURE public.log_item_changes();

-- Stock Keluar History Table
CREATE TABLE IF NOT EXISTS stock_keluar_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_item_id UUID,
  kode_barang TEXT,
  nama_barang TEXT,
  jumlah_barang INTEGER,
  lokasi TEXT,
  nama_lokasi TEXT,
  foto_urls TEXT[] DEFAULT '{}',
  deskripsi TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  tanggal_keluar TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  keterangan_alasan TEXT,
  user_name TEXT
);

ALTER TABLE stock_keluar_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view stock_keluar_history" 
ON stock_keluar_history FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can insert stock_keluar_history" 
ON stock_keluar_history FOR INSERT 
TO authenticated 
WITH CHECK (true);
