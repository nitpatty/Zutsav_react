require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const app = require('./src/app');
const connectDB = require('./src/config/database');
const seedAdmin = require('./src/utils/seedAdmin');
const { setIO } = require('./src/utils/notificationService');
const {
  startDeletionCleanupJob,
  startBookingReminderJobs
} = require('./src/utils/cleanupJobs');

const PORT = 3000;

// ✅ Allowed frontend domains
const allowedOrigins = [
  "http://localhost:3000",
  "http://app.zutsav.com",
  "https://app.zutsav.com",
  "https://frontend.zutsav.com"
];

connectDB().then(async () => {
  await seedAdmin();

  const server = http.createServer(app);

  // ✅ ✅ Socket.IO (FINAL FIX)
  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true); // allow non-browser

        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        } else {
          return callback(new Error("Not allowed by CORS (Socket.IO)"));
        }
      },
      credentials: true,
      methods: ["GET", "POST"]
    },
    transports: ["websocket", "polling"] // ✅ ensure compatibility
  });

  // ✅ ✅ Socket auth middleware
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token;

    if (!token) return next(new Error("Authentication required"));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch (err) {
      next(new Error("Invalid token"));
    }
  });

  // ✅ ✅ Socket connection
  io.on("connection", (socket) => {
    const userId = socket.userId;

    socket.join(`user_${userId}`);
    console.log(`[Socket.IO] User ${userId} connected (${socket.id})`);

    socket.on("disconnect", () => {
      console.log(`[Socket.IO] User ${userId} disconnected`);
    });
  });

  // ✅ Make io globally available
  setIO(io);

  // ✅ Start background jobs
  startDeletionCleanupJob();
  startBookingReminderJobs();

  // ✅ Start server
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Zutsav server running on port ${PORT}`);
  });

  // ✅ Error handling
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`❌ Port ${PORT} already in use`);
    } else {
      console.error("❌ Server error:", err.message);
    }
    process.exit(1);
  });
});
