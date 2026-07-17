import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { connectDB } from '../utils/db.js';
import authRoutes from '../route/auth.route.js';
import userRoutes from '../route/user.route.js';

const app = new Hono();

// Connect database middleware
app.use('*', async (c, next) => {
  await connectDB(c.env);
  await next();
});

// CORS configuration
app.use('*', async (c, next) => {
  const allowedOrigin = c.env.FRONTEND_URL || '*';
  const corsMiddleware = cors({
    origin: allowedOrigin,
    credentials: true,
  });
  return corsMiddleware(c, next);
});

// Routes
app.route('/api/auth', authRoutes);
app.route('/api/user', userRoutes);

// 404 Catch-all
app.notFound((c) => {
  return c.json({ message: 'Route not found' }, 404);
});

// Error handling
app.onError((err, c) => {
  console.error("Unhandled Server Error:", err);
  return c.json({
    message: "An unexpected server error occurred",
    error: err.message,
    stack: err.stack,
  }, 500);
});

export default app;
