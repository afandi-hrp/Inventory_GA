import express from 'express';
import { createServer as createHttpServer } from 'http';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();
app.set('trust proxy', 1); // Trust the reverse proxy
const port = 3000;
const isProduction = process.env.NODE_ENV === 'production';
const supabaseUrl = process.env.VITE_SUPABASE_URL;

// Security Middlewares
// 1. Helmet: Adds various HTTP headers to secure the app (e.g., XSS filter, prevent clickjacking)
app.use(helmet({
  // CSP only in production — in dev, Vite's middleware-mode HMR client relies on
  // inline/eval'd module reloading that a strict policy would block outright.
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      // 'unsafe-inline' needed for React's inline style={{...}} props (compiled to
      // real style="..." attributes, which CSP can't allowlist via nonce/hash).
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', ...(supabaseUrl ? [supabaseUrl] : [])],
      mediaSrc: ["'self'"],
      connectSrc: [
        "'self'",
        ...(supabaseUrl ? [supabaseUrl, supabaseUrl.replace(/^https:/, 'wss:')] : []),
      ],
      objectSrc: ["'none'"],
      // iframe dipakai buat preview PDF: blob: (PDF buatan jsPDF di halaman
      // approval/gudang berkas) & signed URL Supabase (dokumen barang di Master
      // Barang). Dulu 'none' → semua preview PDF ke-blok di production.
      // Situs lain tetap gak bisa nge-embed app ini (frameAncestors di bawah).
      frameSrc: ["'self'", 'blob:', ...(supabaseUrl ? [supabaseUrl] : [])],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
}));

// 2. CORS: Restrict cross-origin requests. Frontend & API selalu satu origin
// (Express yang sama nyajiin dist/), jadi kalau VITE_APP_URL kosong jangan
// fallback ke '*' — `false` = tidak kirim header CORS sama sekali (same-origin only).
app.use(cors({
  origin: process.env.VITE_APP_URL || false,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 3. Rate Limiting: Prevent Brute Force & Botnet attacks on API routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  message: { error: 'Terlalu banyak permintaan dari IP ini, silakan coba lagi setelah 15 menit.' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  validate: {
    xForwardedForHeader: false,
    default: true,
  },
});

// Apply the rate limiting middleware to API calls only
app.use('/api/', apiLimiter);

app.use(express.json());

const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Initialize Supabase Admin only if keys are present
const supabaseAdmin = (supabaseUrl && supabaseServiceKey) 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

// Middleware factory: verifikasi token Supabase, lalu pastikan pemanggil
// punya profil AKTIF dengan salah satu role yang diizinkan. User yang sudah
// dinonaktifkan (is_active = false) ditolak walau token-nya masih berlaku.
// Id, role & nama pemanggil disimpan di req supaya handler bisa pakai.
const requireRole = (allowedRoles: string[], deniedMessage: string) =>
  async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Supabase Admin not initialized. Check environment variables.' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');

    try {
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

      if (authError || !user) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('role, is_active, full_name')
        .eq('id', user.id)
        .single();

      if (profileError || !profile || profile.is_active === false || !allowedRoles.includes(profile.role)) {
        return res.status(403).json({ error: deniedMessage });
      }

      (req as any).userId = user.id;
      (req as any).userRole = profile.role;
      (req as any).userName = profile.full_name || user.email || profile.role;

      next();
    } catch (err) {
      res.status(500).json({ error: 'Internal server error during auth check' });
    }
  };

const checkAdmin = requireRole(['admin'], 'Unauthorized: Admin only');

// API Route to create user
app.post('/api/admin/create-user', checkAdmin, async (req, res) => {
  const { email, password, full_name, role, divisi, jabatan } = req.body;

  if (!email || !password || !full_name || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const { data: newUser, error: createError } = await supabaseAdmin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role }
  });

  if (createError) {
    return res.status(400).json({ error: createError.message });
  }

  // Profil dibuat trigger handle_new_user; divisi & jabatan (dipakai Form Akses
  // Gudang Berkas) diisi setelahnya.
  if (newUser.user && (divisi || jabatan)) {
    const { error: profileError } = await supabaseAdmin!
      .from('profiles')
      .update({ divisi: divisi || null, jabatan: jabatan || null })
      .eq('id', newUser.user.id);
    if (profileError) {
      return res.status(400).json({ error: `User dibuat, tapi gagal menyimpan divisi/jabatan: ${profileError.message}` });
    }
  }

  res.json({ message: 'User created successfully', user: newUser.user });
});

// API Route to delete user
app.delete('/api/admin/delete-user/:userId', checkAdmin, async (req, res) => {
  const { userId } = req.params;
  
  const { error: deleteError } = await supabaseAdmin!.auth.admin.deleteUser(userId);

  if (deleteError) {
    return res.status(400).json({ error: deleteError.message });
  }

  res.json({ message: 'User deleted successfully' });
});

// Only 'spv'/'direktur' can trigger a final approval (SPV finalizes SPK, Direktur
// finalizes Disposal).
const checkFinalApprover = requireRole(['spv', 'direktur'], 'Unauthorized: SPV or Direktur only');

// Per jenis pengajuan: fungsi database yang menjalankan approval final, dan
// satu-satunya role yang boleh memberinya (harus sama dengan tahapan di UI).
const FINAL_APPROVAL_SOURCES = {
  disposal: { rpc: 'finalize_disposal_request', finalRole: 'direktur' },
  spk: { rpc: 'finalize_spk_request', finalRole: 'spv' },
} as const;

// Approval final pemusnahan/SPK. Seluruh prosesnya (status pengajuan → APPROVED,
// catat stock keluar, tandai item APPROVED, hapus barang dari master) jalan di
// SATU transaksi database lewat RPC — kalau ada yang gagal, semuanya batal.
// Dulu prosesnya dijalankan per barang dari browser, jadi bisa berhenti di
// tengah (status APPROVED tapi sebagian barang masih ada di stok).
// Fungsi RPC-nya cuma bisa dipanggil service_role (supabase_approval_finalize.sql).
app.post('/api/approval/finalize', checkFinalApprover, async (req, res) => {
  const userId = (req as any).userId as string;
  const userRole = (req as any).userRole as string;
  const userName = (req as any).userName as string;
  const { type, requestId } = req.body || {};
  const source = FINAL_APPROVAL_SOURCES[type as keyof typeof FINAL_APPROVAL_SOURCES];

  if (!source || typeof requestId !== 'string' || !requestId) {
    return res.status(400).json({ error: 'requestId dan type (disposal/spk) wajib diisi' });
  }
  if (userRole !== source.finalRole) {
    return res.status(403).json({ error: `Approval final ${type} hanya boleh oleh ${source.finalRole}` });
  }

  const { data, error } = await supabaseAdmin!.rpc(source.rpc, {
    p_request_id: requestId,
    p_actor_id: userId,
    p_actor_name: userName,
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json({ message: 'Pengajuan disetujui final', processed: data });
});

// Export the app for Vercel
export default app;

// Start the server if not running on Vercel
if (!process.env.VERCEL) {
  // Create the HTTP server explicitly (instead of app.listen()) so its instance
  // can be handed to Vite's HMR websocket below — otherwise, in middlewareMode,
  // Vite spins up its own detached HMR websocket server that the browser can't
  // reach, causing "WebSocket connection to ws://localhost:24678 failed".
  const httpServer = createHttpServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
  });
}
