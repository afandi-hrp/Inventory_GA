-- 1. Profiles Table with Role and Status
CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT,
    role TEXT CHECK (role IN ('admin', 'user')) DEFAULT 'user',
    is_active BOOLEAN DEFAULT true,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ensure is_active column exists if the table was created before
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_active') THEN
        ALTER TABLE profiles ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- 2. Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_keluar_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE take_item_history ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current user is active
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Profiles Policies
-- Everyone can read profiles (needed for user lists, etc.)
CREATE POLICY "Profiles are viewable by everyone" ON profiles
    FOR SELECT USING (true);

-- Users can only update their own profile (full_name, avatar_url)
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id AND is_active_user());

-- Admins can update any profile (to change roles or status)
CREATE POLICY "Admins can update any profile" ON profiles
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true
        )
    );

-- 4. Items Policies
-- All authenticated users can view items if active
CREATE POLICY "Items are viewable by authenticated users" ON items
    FOR SELECT USING (auth.role() = 'authenticated' AND is_active_user());

-- Only admins can insert/update/delete items
CREATE POLICY "Only admins can modify items" ON items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true
        )
    );

-- 5. History Tables Policies (item_audit_logs, stock_keluar_history, take_item_history)
-- All authenticated users can view history if active
CREATE POLICY "History is viewable by authenticated users" ON item_audit_logs FOR SELECT USING (auth.role() = 'authenticated' AND is_active_user());
CREATE POLICY "History is viewable by authenticated users" ON stock_keluar_history FOR SELECT USING (auth.role() = 'authenticated' AND is_active_user());
CREATE POLICY "History is viewable by authenticated users" ON take_item_history FOR SELECT USING (auth.role() = 'authenticated' AND is_active_user());

-- Only admins can modify history
CREATE POLICY "Only admins can modify history" ON item_audit_logs FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true));
CREATE POLICY "Only admins can modify history" ON stock_keluar_history FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true));
CREATE POLICY "Only admins can modify history" ON take_item_history FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.is_active = true));

-- 6. Trigger for new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, is_active)
  VALUES (
    new.id, 
    new.raw_user_meta_data->>'full_name', 
    COALESCE(new.raw_user_meta_data->>'role', 'user'),
    true
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
