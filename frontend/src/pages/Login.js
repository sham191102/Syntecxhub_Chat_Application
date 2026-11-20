
import React, { useState } from "react";
import { Link } from "react-router-dom";
import "../styles/Auth.css";
import axios from "axios";

function Login() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await axios.post(
        "http://localhost:5000/api/auth/login",
        {
          email: formData.email.trim(),
          password: formData.password,
        }
      );

      localStorage.setItem("token", response.data.token);
      localStorage.setItem("user", JSON.stringify(response.data.user));

      alert("Login successful!");

      window.location.href = "/chat";

    } catch (error) {
      console.error("Login Error:", error);

      alert(
        error.response?.data?.message ||
        "Login failed. Check backend connection."
      );
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="logo">S</div>

        <h1>Welcome Back</h1>
        <p className="subtitle">Login to SyntecChat</p>

        <form onSubmit={handleSubmit}>
          <label>Email or Contact Number</label>

          <input
            type="text"
            name="email"
            placeholder="Enter email or contact number"
            value={formData.email}
            onChange={handleChange}
            required
          />

          <label>Password</label>

          <input
            type="password"
            name="password"
            placeholder="Enter your password"
            value={formData.password}
            onChange={handleChange}
            required
          />

          <button type="submit" className="auth-button">
            Login
          </button>
        </form>

        <p className="auth-footer">
          Don't have an account? <Link to="/signup">Sign Up</Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
