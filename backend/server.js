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

// ✅ Allowed frontend origins
const allowedOrigins = [
  "http://localhost:3000",
  "http://app.zutsav.com",
  "https://app.zutsav.com",
  "https://frontend.zutsav.com"
];

connectDB().then(async () => {
  await seedAdmin();

  const server = http.createServer(app);

  // ✅ ✅ Fixed Socket.IO config
  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: ["GET", "POST", "PATCH"]
    },
    transports: ["websocket", "polling"], // ✅ important
    allowEIO3: true                       // ✅ important
  });

  // ✅ Auth middleware
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token;

    if (!token) return next(new Error("Authentication required"));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  // ✅ Connection
  io.on("connection", (socket) => {
    const userId = socket.userId;

    socket.join(`user_${userId}`);
    console.log(`[Socket.IO] Connected: ${userId}`);

    socket.on("disconnect", () => {
      console.log(`[Socket.IO] Disconnected: ${userId}`);
    });
  });

  setIO(io);

  startDeletionCleanupJob();
  startBookingReminderJobs();

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
});
