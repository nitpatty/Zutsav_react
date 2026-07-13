const config = require('./src/config');
const { validateConfig } = require('./src/config/validate');
const { printHealthReport } = require('./src/config/healthReport');

validateConfig();

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
const NotificationWorker = require('./notification-engine/queue/Worker');
const NotificationEngineBootstrap = require('./notification-engine/bootstrap');

connectDB().then(async () => {
  await seedAdmin();

  const server = http.createServer(app);

  // ✅ ✅ Fixed Socket.IO config
  // origin as a function (like the Express CORS setup in src/app.js) so the
  // System Configuration Center's Deployment tab can change allowed origins
  // live, without restarting the process.
  const io = new Server(server, {
    cors: {
      origin: async (origin, callback) => {
        if (!origin) return callback(null, true);
        const allowedOrigins = await config.cors.getAllowedOrigins();
        callback(null, allowedOrigins.includes(origin));
      },
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
  // Registers v2 channel plugins + the job processor. The queue itself is
  // still empty in production — NotificationEngine.emit() keeps using the
  // old synchronous Dispatcher until the controlled cutover (Phase 4 of the
  // notification-engine rebuild), so this is purely additive infrastructure.
  NotificationEngineBootstrap.init();
  NotificationWorker.start();

  server.listen(config.server.port, async () => {
    console.log(`🚀 Server running on port ${config.server.port}`);
    await printHealthReport();
  });
});
