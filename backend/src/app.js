const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');

const config = require('./config');

const app = express();

// ✅ Root route (CapRover health check)
app.get('/', (req, res) => {
  res.send('Zutsav backend is running ✅');
});

// ✅ Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// ✅ Security
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// ✅ Request ID — correlates a single request across logs and audit records
const { randomUUID } = require('crypto');
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

// ✅ ✅ ✅ CORRECTED CORS CONFIG (FINAL FIX)
// origin is a function so it's re-evaluated on every request — this is what
// lets the System Configuration Center's Deployment tab change the allowed
// origins live, without a server restart (see config/cors.config.js).
const corsOriginFn = async function (origin, callback) {
  if (!origin) return callback(null, true); // allow Postman / server calls

  const allowedOrigins = await config.cors.getAllowedOrigins();
  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  } else {
    return callback(new Error('Not allowed by CORS'));
  }
};

app.use(cors({
  origin: corsOriginFn,
  credentials: true,

  // ✅ IMPORTANT FIX — include PATCH
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],

  // ✅ IMPORTANT — allow headers used by frontend
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ✅ ✅ ✅ CRITICAL — proper preflight handling
app.options('*', cors({
  origin: corsOriginFn,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ✅ Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many attempts. Please try again after 15 minutes.'
  },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please slow down.'
  },
});

app.use('/api/auth', authLimiter);
app.use('/api/', apiLimiter);

// ✅ Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

// ✅ Request monitoring
const _reqCounts = {};
app.use('/api/', (req, res, next) => {
  const key = `${req.method} ${req.path.replace(/\/[a-f0-9]{24}/gi, '/:id')}`;
  const now = Date.now();

  if (!_reqCounts[key] || now - _reqCounts[key].since > 60000) {
    _reqCounts[key] = { count: 1, since: now };
  } else {
    _reqCounts[key].count++;
    if (_reqCounts[key].count === 20) {
      console.warn(`[RATE MONITOR] High frequency: ${key}`);
    }
  }

  next();
});

// ✅ Static files
app.use('/uploads', express.static(path.join(__dirname, '..', config.constants.uploadDir)));

// ✅ Routes
app.use('/api/auth',             require('./routes/auth.routes'));
app.use('/api/auth/forgot-password', require('./routes/passwordReset.routes'));
app.use('/api/users',            require('./routes/user.routes'));
app.use('/api/pandits',          require('./routes/pandit.routes'));
app.use('/api/pandit/pooja-requests', require('./routes/poojaRequest.routes'));
app.use('/api/admin',            require('./routes/admin.routes'));
app.use('/api/admin-management', require('./routes/adminManagement.routes'));
app.use('/api/masters',          require('./routes/masters.routes'));
app.use('/api/bookings',         require('./routes/booking.routes'));
app.use('/api/checkout',         require('./routes/checkout.routes'));
app.use('/api/poojas',           require('./routes/pooja.routes'));
app.use('/api/festivals',        require('./routes/festival.routes'));
app.use('/api/marketplace',      require('./routes/marketplace.routes'));
app.use('/api/temples',          require('./routes/temple.routes'));
app.use('/api/hero-banners',     require('./routes/heroBanner.routes'));
app.use('/api/livestreams',      require('./routes/livestream.routes'));
app.use('/api/ai',               require('./routes/ai.routes'));
app.use('/api/panchang',         require('./routes/panchang.routes'));
app.use('/api/referral',         require('./routes/referral.routes'));
app.use('/api/notifications',    require('./routes/notification.routes'));
app.use('/api/comm',             require('./routes/comm.routes'));
app.use('/api/settings',         require('./routes/settings.routes'));
app.use('/api/blogs',            require('./routes/blog.routes'));
app.use('/api/invoices',         require('./routes/invoice.routes'));
app.use('/api/documents',        require('./routes/legalDocument.routes'));

// ✅ ✅ Error handler (improved)
app.use((err, req, res, next) => {
  console.error(err.stack);

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS blocked this request'
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

module.exports = app;
