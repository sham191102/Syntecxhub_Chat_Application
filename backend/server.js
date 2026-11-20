
require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const { Server } = require("socket.io");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const messageRoutes = require("./routes/messageRoutes");
const profileRoutes = require("./routes/profileRoutes");
const User = require("./models/User");

const app = express();

// MIDDLEWARE
app.use(cors());
app.use(express.json());

// SERVE PROFILE PICTURE UPLOADS
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// TEST API
app.get("/", (req, res) => {
  res.send("SyntecChat Backend Running");
});

// ROUTES
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/profile", profileRoutes);

// HTTP SERVER
const server = http.createServer(app);

// SOCKET.IO SETUP
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// ONLINE USERS
const onlineUsers = new Map();

// SOCKET CONNECTION
io.on("connection", (socket) => {
  console.log("User Connected:", socket.id);

  // JOIN USER ROOM
  socket.on("join_user", async (userId) => {
    if (!userId) return;

    const id = String(userId);

    socket.data.userId = id;
    socket.join(id);

    // Multiple connections support
    if (!onlineUsers.has(id)) {
      onlineUsers.set(id, new Set());
    }

    onlineUsers.get(id).add(socket.id);

    console.log("User joined room:", id);

    // Send online users list
    io.emit("online_users", Array.from(onlineUsers.keys()));
  });

  // TYPING INDICATOR
  socket.on("typing", ({ receiver, userName }) => {
    if (!receiver) return;

    io.to(String(receiver)).emit("user_typing", {
      sender: socket.data.userId,
      userName,
    });
  });

  // STOP TYPING
  socket.on("stop_typing", ({ receiver }) => {
    if (!receiver) return;

    io.to(String(receiver)).emit("user_stop_typing", {
      sender: socket.data.userId,
    });
  });

  // DISCONNECT
  socket.on("disconnect", async () => {
    const userId = socket.data.userId;

    if (userId && onlineUsers.has(userId)) {
      const userSockets = onlineUsers.get(userId);

      userSockets.delete(socket.id);

      // Only update lastSeen when all connections are closed
      if (userSockets.size === 0) {
        onlineUsers.delete(userId);

        try {
          const lastSeen = new Date();

          // SAVE LAST SEEN IN MONGODB
          await User.findByIdAndUpdate(userId, {
            lastSeen: lastSeen,
          });

          // SEND LAST SEEN UPDATE
          io.emit("last_seen_updated", {
            userId: userId,
            lastSeen: lastSeen,
          });

          console.log("Last Seen Updated:", userId, lastSeen);
        } catch (error) {
          console.log("Last Seen Error:", error.message);
        }
      }

      // UPDATE ONLINE USERS
      io.emit("online_users", Array.from(onlineUsers.keys()));
    }

    console.log("User Disconnected:", socket.id);
  });
});

// MESSAGE ROUTES
app.use("/api/messages", messageRoutes(io));

// MONGODB CONNECTION
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected Successfully");

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB Connection Failed:", error.message);
  });
