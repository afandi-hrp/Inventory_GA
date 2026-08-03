import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AppSettings } from '../types';

const DEFAULT_SETTINGS: AppSettings = {
  login_title: 'Stock GA',
  login_footer: '© 2024 Inventory System. All rights reserved.',
  login_bg_url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=2000',
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('*')
          .eq('id', 1)
          .single();
        
        if (error) {
          console.warn('Settings not found, using defaults');
        } else if (data) {
          setSettings(data);
        }
      } catch (err) {
        console.error('Error fetching settings:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []);

  return { settings, loading, setSettings };
}
