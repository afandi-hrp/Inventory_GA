import express from 'express';
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

// Security Middlewares
// 1. Helmet: Adds various HTTP headers to secure the app (e.g., XSS filter, prevent clickjacking)
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for Vite dev server compatibility
  crossOriginEmbedderPolicy: false,
}));

// 2. CORS: Restrict cross-origin requests
app.use(cors({
  origin: process.env.VITE_APP_URL || '*', // Allow only the specific origin in production
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

const supabaseUrl = process.env.VITE_SUPABASE_URL;
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

const checkAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
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
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized: Admin only' });
    }

    next();
  } catch (err) {
    res.status(500).json({ error: 'Internal server error during auth check' });
  }
};

// API Route to create user
app.post('/api/admin/create-user', checkAdmin, async (req, res) => {
  const { email, password, full_name, role } = req.body;

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

// Middleware to check if user is authenticated (any role)
const checkAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase Admin not initialized' });
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
    // Attach user to request for further use if needed
    (req as any).user = user;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Internal server error during auth check' });
  }
};

// API Route to delete an item bypassing RLS (used for disposal approval)
app.delete('/api/inventory/delete-item/:itemId', checkAuth, async (req, res) => {
  const { itemId } = req.params;
  
  if (!itemId || itemId === 'undefined') {
    return res.status(400).json({ error: 'Invalid item ID' });
  }

  const { data, error } = await supabaseAdmin!.from('items').delete().eq('id', itemId).select('*');

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  if (!data || data.length === 0) {
    return res.status(404).json({ error: 'Item not found' });
  }

  res.json({ message: 'Item deleted successfully', data });
});

// Vite middleware for development
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Export the app for Vercel
export default app;

// Start the server if not running on Vercel
if (!process.env.VERCEL) {
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
  });
}
