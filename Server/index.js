require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
app.use(cors()); // Add cors middleware
const server = http.createServer(app);
const leaveRoom = require('./utils/leave-room');
const CHAT_BOT = 'ChatBot';

const harperSaveMessage = require('./services/harper-save-message');
const harperGetMessages = require('./services/harper-get-messages');

let chatRoom = '';
let allUsers = []; // All users in current chat room

// Create an io server and allow for CORS from http://localhost:3000 with GET and POST methods
const io = new Server(server, {
  cors: {
    origin: process.env.ORIGIN_URL,
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log(socket.id);

  socket.on('join_room', (data) => {
    const { username, room } = data;
    socket.join(room);

    let __createdTime__ = Date.now();

    socket.to(room).emit('receive_message', {
      message: `${username} has joined`,
      username: CHAT_BOT,
      __createdTime__,
    });

    socket.emit('receive_message', {
      message: `Welcome ${username}`,
      username: CHAT_BOT,
      __createdTime__,
    });
    chatRoom = room;
    allUsers.push({ id: socket.id, username, room });
    chatRoomUsers = allUsers.filter((user) => user.room === room);
    socket.to(room).emit('chatroom_users', chatRoomUsers);
    socket.emit('chatroom_users', chatRoomUsers);

    harperGetMessages(room)
      .then((last100Messages) => {
        // console.log('latest messages', last100Messages);
        socket.emit('last_100_messages', last100Messages);
      })
      .catch((err) => console.log(err));
  });

  socket.on('send_message', (data) => {
    const { message, username, room, __createdtime__ } = data;
    io.in(room).emit('receive_message', data); // Send to all users in room, including sender
    harperSaveMessage(message, username, room, __createdtime__) // Save message in db
      .then((response) => console.log(response))
      .catch((err) => console.log(err));
  });
  socket.on('leave_room', (data) => {
    const { username, room } = data;
    socket.leave(room);
    const __createdtime__ = Date.now();
    // Remove user from memory
    allUsers = leaveRoom(socket.id, allUsers);
    socket.to(room).emit('chatroom_users', allUsers);
    socket.to(room).emit('receive_message', {
      username: CHAT_BOT,
      message: `${username} has left the chat`,
      __createdtime__,
    });
    console.log(`${username} has left the chat`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected from the chat');
    const user = allUsers.find((user) => user.id == socket.id);
    if (user?.username) {
      allUsers = leaveRoom(socket.id, allUsers);
      socket.to(chatRoom).emit('chatroom_users', allUsers);
      socket.to(chatRoom).emit('receive_message', {
        message: `${user.username} has disconnected from the chat.`,
      });
    }
  });
});

server.listen(4000, () => 'Server is running on port 4000');
