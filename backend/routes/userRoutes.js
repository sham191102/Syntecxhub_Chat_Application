
const express = require("express");
const router = express.Router();
const User = require("../models/User");

// GET ALL USERS
router.get("/", async (req, res) => {
  try {
    const users = await User.find().select("-password");

    res.status(200).json(users);
  } catch (error) {
    console.log("Users Error:", error.message);

    res.status(500).json({
      message: "Failed to fetch users",
    });
  }
});

module.exports = router;
