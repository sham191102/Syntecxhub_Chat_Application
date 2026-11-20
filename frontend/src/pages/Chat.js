
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import "../styles/Chat.css";

function Chat() {
  const storedUser = JSON.parse(localStorage.getItem("user") || "null");
  const token = localStorage.getItem("token");

  const [user, setUser] = useState(storedUser);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUser, setTypingUser] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const typingTimeout = useRef(null);
  const fileInputRef = useRef(null);

  // FORMAT LAST SEEN
  const formatLastSeen = (date) => {
    if (!date) return "Last seen unavailable";

    return new Date(date).toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  // PROFILE IMAGE URL
  const getProfilePic = (profilePic) => {
    if (!profilePic) return null;

    if (profilePic.startsWith("http")) {
      return profilePic;
    }

    return `http://localhost:5000${profilePic}`;
  };

  // FETCH USERS
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await axios.get(
          "http://localhost:5000/api/users"
        );

        setUsers(response.data);
      } catch (error) {
        console.log("Users Fetch Error:", error.message);
      }
    };

    fetchUsers();
  }, []);

  // CONNECT SOCKET
  useEffect(() => {
    if (!user?.id) return;

    const newSocket = io("http://localhost:5000");

    newSocket.on("connect", () => {
      console.log("Socket connected:", newSocket.id);
      newSocket.emit("join_user", user.id);
    });

    // RECEIVE ONLINE USERS
    newSocket.on("online_users", (usersList) => {
      setOnlineUsers(usersList);

      axios
        .get("http://localhost:5000/api/users")
        .then((response) => {
          setUsers(response.data);

          setSelectedUser((prev) => {
            if (!prev) return prev;

            const updatedUser = response.data.find(
              (u) => String(u._id) === String(prev._id)
            );

            return updatedUser
              ? { ...prev, ...updatedUser }
              : prev;
          });
        })
        .catch((error) =>
          console.log("Users Refresh Error:", error.message)
        );
    });

    // RECEIVE LAST SEEN
    const handleLastSeenUpdate = (data) => {
      setUsers((prevUsers) =>
        prevUsers.map((u) =>
          String(u._id) === String(data.userId)
            ? { ...u, lastSeen: data.lastSeen }
            : u
        )
      );

      setSelectedUser((prev) =>
        prev && String(prev._id) === String(data.userId)
          ? { ...prev, lastSeen: data.lastSeen }
          : prev
      );
    };

    newSocket.on("last_seen_updated", handleLastSeenUpdate);
    newSocket.on("user_last_seen_update", handleLastSeenUpdate);

    setSocket(newSocket);

    return () => {
      newSocket.off("online_users");
      newSocket.off("last_seen_updated", handleLastSeenUpdate);
      newSocket.off("user_last_seen_update", handleLastSeenUpdate);
      newSocket.disconnect();
    };
  }, [user?.id]);

  // UPLOAD PROFILE PICTURE
  const handleProfileUpload = async (e) => {
    const file = e.target.files[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      e.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image size must be less than 5 MB");
      e.target.value = "";
      return;
    }

    try {
      setUploadingPhoto(true);

      const formData = new FormData();
      formData.append("profilePic", file);

      const response = await axios.post(
        `http://localhost:5000/api/profile/${user.id}`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const updatedUser = {
        ...user,
        ...response.data.user,
        id: user.id,
      };

      setUser(updatedUser);
      localStorage.setItem("user", JSON.stringify(updatedUser));

      setUsers((prevUsers) =>
        prevUsers.map((u) =>
          String(u._id) === String(user.id)
            ? { ...u, ...response.data.user }
            : u
        )
      );

      alert("Profile picture updated successfully!");
    } catch (error) {
      console.log("Profile Upload Error:", error.message);

      alert(
        error.response?.data?.message ||
          "Profile picture upload failed"
      );
    } finally {
      setUploadingPhoto(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // FETCH CHAT HISTORY (JWT SECURED)
  useEffect(() => {
    if (!selectedUser || !user?.id) return;

    const fetchMessages = async () => {
      try {
        const response = await axios.get(
          `http://localhost:5000/api/messages/${user.id}/${selectedUser._id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        setMessages(response.data);
      } catch (error) {
        console.log("Messages Fetch Error:", error.message);
      }
    };

    fetchMessages();
  }, [selectedUser, user?.id, token]);

  // RECEIVE REAL-TIME MESSAGES
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (message) => {
      const senderId = String(message.sender);
      const receiverId = String(message.receiver);
      const currentUserId = String(user.id);
      const selectedUserId = String(selectedUser?._id);

      const isCurrentChat =
        selectedUser &&
        ((senderId === currentUserId &&
          receiverId === selectedUserId) ||
          (senderId === selectedUserId &&
            receiverId === currentUserId));

      if (isCurrentChat) {
        setMessages((prev) => {
          const exists = prev.some(
            (m) => String(m._id) === String(message._id)
          );

          if (exists) return prev;

          return [...prev, message];
        });
      }
    };

    socket.on("receive_message", handleMessage);

    return () => {
      socket.off("receive_message", handleMessage);
    };
  }, [socket, selectedUser, user?.id]);

  // RECEIVE TYPING STATUS
  useEffect(() => {
    if (!socket || !selectedUser) return;

    const handleTyping = (data) => {
      if (String(data.sender) === String(selectedUser._id)) {
        setTypingUser(data.userName);
      }
    };

    const handleStopTyping = (data) => {
      if (String(data.sender) === String(selectedUser._id)) {
        setTypingUser(null);
      }
    };

    socket.on("user_typing", handleTyping);
    socket.on("user_stop_typing", handleStopTyping);

    return () => {
      socket.off("user_typing", handleTyping);
      socket.off("user_stop_typing", handleStopTyping);
    };
  }, [socket, selectedUser]);

  // HANDLE TYPING
  const handleTypingChange = (value) => {
    setText(value);

    if (!selectedUser || !socket) return;

    if (value.trim()) {
      socket.emit("typing", {
        receiver: selectedUser._id,
        userName: user.name,
      });

      clearTimeout(typingTimeout.current);

      typingTimeout.current = setTimeout(() => {
        socket.emit("stop_typing", {
          receiver: selectedUser._id,
        });
      }, 1500);
    } else {
      clearTimeout(typingTimeout.current);

      socket.emit("stop_typing", {
        receiver: selectedUser._id,
      });
    }
  };

  // SEND MESSAGE (JWT SECURED)
  const handleSend = async (e) => {
    e.preventDefault();

    if (!text.trim() || !selectedUser || !user?.id) return;

    try {
      await axios.post(
        "http://localhost:5000/api/messages",
        {
          receiver: selectedUser._id,
          text: text.trim(),
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setText("");

      clearTimeout(typingTimeout.current);

      socket.emit("stop_typing", {
        receiver: selectedUser._id,
      });
    } catch (error) {
      console.log("Send Message Error:", error.message);
      alert(
        error.response?.data?.message ||
          "Message could not be sent"
      );
    }
  };

  // LOGOUT
  const handleLogout = () => {
    clearTimeout(typingTimeout.current);

    localStorage.removeItem("user");
    localStorage.removeItem("token");

    window.location.href = "/login";
  };

  // FILTER USERS
  const filteredUsers = users.filter(
    (u) =>
      String(u._id) !== String(user?.id) &&
      u.name.toLowerCase().includes(search.toLowerCase())
  );

  // CHECK ONLINE
  const isOnline = (userId) =>
    onlineUsers.some((id) => String(id) === String(userId));

  return (
    <div className="chat-container">
      {/* SIDEBAR */}
      <div className="chat-sidebar">
        {/* APP HEADER */}
        <div className="chat-header">
          <h2>SyntecChat</h2>
        </div>

        {/* PROFILE */}
        <div className="profile-box">
          <div className="profile-avatar">
            {getProfilePic(user?.profilePic) ? (
              <img
                src={getProfilePic(user.profilePic)}
                alt="Profile"
                className="profile-image"
              />
            ) : (
              user?.name?.charAt(0).toUpperCase() || "U"
            )}
          </div>

          <div className="profile-details">
            <h3>{user?.name || "User"}</h3>

            <p className="status-text">
              <span className="status-dot online-dot"></span>
              Online
            </p>

            <button
              type="button"
              className="change-photo-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? "Uploading..." : "Change Photo"}
            </button>

            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleProfileUpload}
              style={{ display: "none" }}
            />
          </div>

          <button
            className="logout-btn"
            onClick={handleLogout}
            type="button"
          >
            Logout
          </button>
        </div>

        {/* SEARCH USERS */}
        <div className="search-box">
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* USERS LIST */}
        <div className="contact-list">
          {filteredUsers.length === 0 ? (
            <p className="empty-contact">
              No other users registered
            </p>
          ) : (
            filteredUsers.map((u) => (
              <div
                className={`contact-item ${
                  selectedUser?._id === u._id
                    ? "active-contact"
                    : ""
                }`}
                key={u._id}
                onClick={() => {
                  clearTimeout(typingTimeout.current);
                  setTypingUser(null);
                  setText("");
                  setSelectedUser(u);
                }}
              >
                {/* CONTACT AVATAR */}
                <div className="contact-avatar">
                  {getProfilePic(u.profilePic) ? (
                    <img
                      src={getProfilePic(u.profilePic)}
                      alt={u.name}
                      className="profile-image"
                    />
                  ) : (
                    u.name.charAt(0).toUpperCase()
                  )}
                </div>

                <div className="contact-info">
                  <h4>{u.name}</h4>
                  <p>{u.email}</p>

                  <p className="status-text">
                    <span
                      className={`status-dot ${
                        isOnline(u._id)
                          ? "online-dot"
                          : "offline-dot"
                      }`}
                    ></span>

                    {isOnline(u._id)
                      ? "Online"
                      : formatLastSeen(u.lastSeen)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* MAIN CHAT AREA */}
      <div className="chat-main">
        {!selectedUser ? (
          <div className="welcome-chat">
            <div className="welcome-icon">💬</div>

            <h1>Welcome to SyntecChat!</h1>
            <p>Your conversations will appear here.</p>
            <p>Select a user to start chatting.</p>
          </div>
        ) : (
          <div className="message-panel">
            {/* CHAT HEADER */}
            <div className="message-header">
              <div className="contact-avatar">
                {getProfilePic(selectedUser.profilePic) ? (
                  <img
                    src={getProfilePic(selectedUser.profilePic)}
                    alt={selectedUser.name}
                    className="profile-image"
                  />
                ) : (
                  selectedUser.name.charAt(0).toUpperCase()
                )}
              </div>

              <div>
                <h3>{selectedUser.name}</h3>

                {typingUser ? (
                  <p className="typing-indicator">
                    typing...
                  </p>
                ) : (
                  <p className="status-text">
                    <span
                      className={`status-dot ${
                        isOnline(selectedUser._id)
                          ? "online-dot"
                          : "offline-dot"
                      }`}
                    ></span>

                    {isOnline(selectedUser._id)
                      ? "Online"
                      : formatLastSeen(selectedUser.lastSeen)}
                  </p>
                )}
              </div>
            </div>

            {/* MESSAGES */}
            <div className="message-list">
              {messages.map((message) => (
                <div
                  key={message._id}
                  className={`message-bubble ${
                    String(message.sender) === String(user?.id)
                      ? "sent"
                      : "received"
                  }`}
                >
                  <p>{message.text}</p>

                  <small>
                    {new Date(message.createdAt).toLocaleTimeString(
                      [],
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                      }
                    )}
                  </small>
                </div>
              ))}
            </div>

            {/* MESSAGE INPUT */}
            <form
              className="message-input-area"
              onSubmit={handleSend}
            >
              <input
                type="text"
                placeholder="Type your message..."
                value={text}
                onChange={(e) =>
                  handleTypingChange(e.target.value)
                }
              />

              <button
                type="submit"
                disabled={!text.trim()}
              >
                Send
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default Chat;
