import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { supabase } from './supabase';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Bikin nomor dokumen format PREFIX-DDMMYYYY-NNNN, NNNN dihitung dari jumlah
// dokumen dengan prefix tanggal yang sama supaya urut per hari (reset tiap hari).
export async function generateDailyDocNumber(table: string, column: string, prefix: string): Promise<string> {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  const likePrefix = `${prefix}-${dd}${mm}${yyyy}-`;

  const { count } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .like(column, `${likePrefix}%`);

  const seq = String((count || 0) + 1).padStart(4, '0');
  return `${likePrefix}${seq}`;
}
