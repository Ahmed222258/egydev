const express = require('express');
const dotenv = require('dotenv');
// Load environment variables
dotenv.config();

const mongoose = require('mongoose');

// Security & performance middleware
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const path = require('path');

// Route imports
const authRoutes = require('./route/auth.route');
const userRoutes = require('./route/user.route');
const productRoutes = require('./route/product.route');
const categorieRoutes = require('./route/categorie.route');
const subcategorieRoutes = require('./route/subcategory.routes'); // FIX #16: corrected name
const brandRoutes = require('./route/brand.route');
const cartRoutes = require('./route/cart.route');
const orderRoutes = require('./route/order.route');
const testimonialRoutes = require('./route/testimonial.routes'); // FIX #16: corrected name
const teamRoutes = require('./route/team.route');
const reviewRoutes = require('./route/review.route');
const dashboardRoutes = require('./route/dashboard.route');
const wishlistRoutes = require('./route/wishlist.route');
const paymentRoutes = require('./route/payment.route');

const app = express();

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce';
mongoose.connect(mongoUri)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// ── SECURITY & UTILITY MIDDLEWARES ───────────────────────────────────────────
// Secure HTTP headers
app.use(helmet());

// Compress all responses
app.use(compression());

// FIX #13: Limit json requests size to 1mb to prevent memory exhaustion
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// FIX #19: Use express-mongo-sanitize to prevent MongoDB operator injection
app.use(mongoSanitize());

// Logger for requests
app.use(morgan('combined'));

// CORS configuration
const allowedOrigin = process.env.FRONTEND_URL || '*';
app.use(cors({
  origin: allowedOrigin,
  credentials: true
}));

// Rate limiting for auth routes (brute-force protection)
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 mins
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // Max requests
  message: { message: 'Too many requests from this IP, please try again later.' }
});

// Apply rate limiter to auth routes and registration POST /api/user (Fix #11)
app.use('/api/auth', authLimiter);
app.post('/api/user', authLimiter);

// Serve static images folder
app.use('/img', express.static(path.join(__dirname, './uploads')));

// ── API ROUTES ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/product', productRoutes);
app.use('/api/categories', categorieRoutes);
app.use('/api/subcategorie', subcategorieRoutes);
app.use('/api/brand', brandRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api', testimonialRoutes);
app.use('/api/payment', paymentRoutes);

// FIX #12: 404 catch-all route for unrecognized paths
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// ── ERROR HANDLING MIDDLEWARE ────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    message: 'An unexpected server error occurred',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

const port = process.env.PORT || 8000;
app.listen(port, () => console.log(`Server started on port ${port}`));

module.exports = app;
