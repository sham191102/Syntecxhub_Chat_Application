const express = require("express");
const router = express.Router();

const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// SIGNUP
router.post("/signup", async (req, res) => {
  try {
    const { name, email, contact, password } = req.body;

    if (!name || !email || !contact || !password) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanContact = contact.trim();

    if (!/^\+?[0-9]{7,15}$/.test(cleanContact)) {
      return res.status(400).json({
        message: "Please enter a valid contact number",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }

    const existingUser = await User.findOne({
      $or: [
        { email: cleanEmail },
        { contact: cleanContact },
      ],
    });

    if (existingUser) {
      return res.status(400).json({
        message: "Email or contact number already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name: name.trim(),
      email: cleanEmail,
      contact: cleanContact,
      password: hashedPassword,
    });

    await user.save();

    res.status(201).json({
      message: "Account created successfully!",
    });
  } catch (error) {
    console.log("Signup Error:", error.message);

    res.status(500).json({
      message: "Server error during signup",
    });
  }
});

// LOGIN (EMAIL OR CONTACT)
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email/contact and password are required",
      });
    }

    const loginValue = email.trim().toLowerCase();

    const user = await User.findOne({
      $or: [
        { email: loginValue },
        { contact: loginValue },
      ],
    });

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid password",
      });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      message: "Login successful!",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        contact: user.contact,
        profilePic: user.profilePic,
      },
    });
  } catch (error) {
    console.log("Login Error:", error.message);

    res.status(500).json({
      message: "Server error during login",
    });
  }
});

module.exports = router;