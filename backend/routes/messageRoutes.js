const express = require("express");
const router = express.Router();
const Message = require("../models/Message");
const authMiddleware = require("../middleware/authMiddleware");

// GET CHAT HISTORY
router.get("/:userId/:selectedUserId", authMiddleware, async (req, res) => {
  try {
    const { userId, selectedUserId } = req.params;

    // Verify that requested user is actually logged in
    if (String(req.user._id) !== userId) {
      return res.status(403).json({
        message: "Unauthorized access",
      });
    }

    const messages = await Message.find({
      $or: [
        { sender: req.user._id, receiver: selectedUserId },
        { sender: selectedUserId, receiver: req.user._id },
      ],
    }).sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Fetch Messages Error:", error.message);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
});

// SEND MESSAGE
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { receiver, text } = req.body;

    if (!receiver || !text || !text.trim()) {
      return res.status(400).json({
        message: "Receiver and text are required",
      });
    }

    if (!require("mongoose").Types.ObjectId.isValid(receiver)) {
      return res.status(400).json({
        message: "Invalid receiver ID",
      });
    }

    if (String(req.user._id) === receiver) {
      return res.status(400).json({
        message: "You cannot message yourself",
      });
    }

    const io = req.app.get("io");

    const receiverOnline =
      io && io.sockets.adapter.rooms.has(String(receiver));

    const message = await Message.create({
      sender: req.user._id,
      receiver,
      text: text.trim(),
      delivered: Boolean(receiverOnline),
      read: false,
    });

    if (io) {
      io.to(String(receiver)).emit("receive_message", message);
      io.to(String(req.user._id)).emit("receive_message", message);
    }

    res.status(201).json(message);
  } catch (error) {
    console.log("Send Message Error:", error.message);
    res.status(500).json({ message: "Message could not be sent" });
  }
});

// MARK MESSAGES AS READ
router.post("/read/:senderId/:receiverId", authMiddleware, async (req, res) => {
  try {
    const { senderId, receiverId } = req.params;

    // Only the receiver can mark their received messages as read
    if (String(req.user._id) !== receiverId) {
      return res.status(403).json({
        message: "Unauthorized read receipt",
      });
    }

    const io = req.app.get("io");

    const result = await Message.updateMany(
      {
        sender: senderId,
        receiver: req.user._id,
        read: false,
      },
      {
        $set: {
          read: true,
          delivered: true,
          readAt: new Date(),
        },
      }
    );

    if (io && result.modifiedCount > 0) {
      io.to(String(senderId)).emit("messages_read", {
        senderId,
        receiverId,
      });
    }

    res.status(200).json({
      message: "Messages marked as read",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.log("Read Messages Error:", error.message);
    res.status(500).json({ message: "Failed to mark messages as read" });
  }
});

module.exports = (io) => {
  router.use((req, res, next) => {
    req.app.set("io", io);
    next();
  });

  return router;
};