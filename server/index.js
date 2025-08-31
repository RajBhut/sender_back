import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get frontend URL from environment, fallback to localhost for development
const frontend_url = process.env.FRONTEND_URL || "http://localhost:5173";
const allowed_origins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://localhost:5173",
  "https://localhost:3000",
  frontend_url,
  "http://sender.rajb.tech",
  "https://sender.rajb.tech",
  /\.rajb\.tech$/,
  /\.netlify\.app$/,
  /\.vercel\.app$/,
  /\.coolify\.app$/,
  /localhost:\d+$/,
];

const app = express();

// Add CORS middleware with logging
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      console.log("CORS origin check:", origin);

      // Check if origin is in allowed list
      const isAllowed = allowed_origins.some((allowedOrigin) => {
        if (typeof allowedOrigin === "string") {
          return allowedOrigin === origin;
        } else if (allowedOrigin instanceof RegExp) {
          return allowedOrigin.test(origin);
        }
        return false;
      });

      console.log("Origin allowed:", isAllowed);

      if (isAllowed) {
        callback(null, true);
      } else {
        console.log("CORS blocked origin:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      console.log("Socket.IO CORS origin check:", origin);

      // Check if origin is in allowed list
      const isAllowed = allowed_origins.some((allowedOrigin) => {
        if (typeof allowedOrigin === "string") {
          return allowedOrigin === origin;
        } else if (allowedOrigin instanceof RegExp) {
          return allowedOrigin.test(origin);
        }
        return false;
      });

      console.log("Socket.IO Origin allowed:", isAllowed);

      if (isAllowed) {
        callback(null, true);
      } else {
        console.log("Socket.IO CORS blocked origin:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  },
  allowEIO3: true, // Allow Engine.IO v3 clients
  transports: ["polling", "websocket"],
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(join(__dirname, "../dist")));

  app.get("*", (req, res) => {
    res.sendFile(join(__dirname, "../dist/index.html"));
  });
}

// Add a test endpoint for CORS
app.get("/test", (req, res) => {
  console.log("Test endpoint hit from origin:", req.headers.origin);
  res.json({
    message: "CORS test successful",
    origin: req.headers.origin,
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const rooms = new Map();

// Add error handling for socket.io
io.engine.on("connection_error", (err) => {
  console.log("Connection error:", err.req); // the request object
  console.log("Error code:", err.code); // the error code, for example 1
  console.log("Error message:", err.message); // the error message, for example "Session ID unknown"
  console.log("Error context:", err.context); // some additional error context
});

io.on("connection", (socket) => {
  console.log(
    "User connected:",
    socket.id,
    "from origin:",
    socket.handshake.headers.origin
  );

  socket.on("create-room", () => {
    const roomId = Math.random().toString(36).substring(7);
    rooms.set(roomId, { host: socket.id });
    socket.join(roomId);
    socket.emit("room-created", roomId);
  });

  socket.on("join-room", (roomId) => {
    const room = rooms.get(roomId);
    if (room) {
      socket.join(roomId);
      socket.to(roomId).emit("user-joined", socket.id);
    } else {
      socket.emit("room-not-found");
    }
  });

  socket.on("offer", (offer, roomId, targetId) => {
    socket.to(targetId).emit("offer", offer, socket.id);
  });

  socket.on("answer", (answer, roomId, targetId) => {
    socket.to(targetId).emit("answer", answer, socket.id);
  });

  socket.on("ice-candidate", (candidate, roomId, targetId) => {
    socket.to(targetId).emit("ice-candidate", candidate, socket.id);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    rooms.forEach((room, roomId) => {
      if (room.host === socket.id) {
        rooms.delete(roomId);
        io.to(roomId).emit("host-disconnected");
      }
    });
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
