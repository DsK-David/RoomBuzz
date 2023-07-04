const path = require('path');
const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const Filter = require('bad-words');
const { generateMessage, generateLocationMessage } = require('./utils/messages');
const { addUser, removeUser, getUser, getUsersInRoom } = require('./utils/users');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const port = process.env.PORT || 3000;
const publicDirectoryPath = path.join(__dirname, '../public');

app.use(express.static(publicDirectoryPath));

// Objeto para armazenar as mensagens por sala
const chatMessages = {};

// Objeto para armazenar as salas de cada usuário
const userRooms = {};

io.on('connection', (socket) => {
    console.log(`${socket.id}`);

    socket.on('join', (options, callback) => {
        const { error, user } = addUser({ id: socket.id, ...options });

        if (error) {
            return callback(error);
        }

        socket.join(user.room);

        // Inicializar o array de salas do usuário, se ainda não estiver definido
        if (!userRooms[user.id]) {
            userRooms[user.id] = [];
        }

        userRooms[user.id].push(user.room); // Adicionar a sala ao array de salas do usuário

        // Verificar se a sala já tem mensagens antigas
        if (chatMessages[user.room]) {
            // Enviar as mensagens antigas para o usuário que está se conectando
            chatMessages[user.room].forEach((message) => {
                socket.emit('message', message);
            });
        }

        // Enviar a lista de salas para o usuário
        socket.emit('roomList', userRooms[user.id]);

        socket.emit('message', generateMessage('Bot', `Bem vindo ${user.username}`));
        socket.broadcast.to(user.room).emit('message', generateMessage('Bot', `${user.username} entrou!`));
        io.to(user.room).emit('roomData', {
            room: user.room,
            users: getUsersInRoom(user.room)
        });

        callback();
    });

    socket.on('sendMessage', (message, callback) => {
        const user = getUser(socket.id);
        const filter = new Filter();

        if (filter.isProfane(message)) {
            return callback('Profanity is not allowed!');
        }

        // Verificar se a sala já tem um array de mensagens antigas
        if (!chatMessages[user.room]) {
            chatMessages[user.room] = []; // Criar um array de mensagens antigas para a sala
        }

        // Armazenar a mensagem no array de mensagens antigas da sala
        const chatMessage = generateMessage(user.username, message);
        chatMessages[user.room].push(chatMessage);

        io.to(user.room).emit('message', chatMessage);

        // Atualizar a lista de salas do usuário com a sala atual
        if (!userRooms[user.id].includes(user.room)) {
            userRooms[user.id].push(user.room);
        }

        // Enviar a lista de salas atualizada para o usuário
        socket.emit('roomList', userRooms[user.id]);

        callback();
    });

    socket.on('sendLocation', (coords, callback) => {
        const user = getUser(socket.id);
        io.to(user.room).emit('locationMessage', generateLocationMessage(user.username, `https://google.com/maps?q=${coords.latitude},${coords.longitude}`));
        callback();
    });

    socket.on('disconnect', () => {
        const user = removeUser(socket.id);

        if (user) {
            io.to(user.room).emit('message', generateMessage('Bot', `${user.username} saiu!`));
            io.to(user.room).emit('roomData', {
                room: user.room,
                users: getUsersInRoom(user.room)
            });

            // Remover a sala da lista de salas do usuário
            userRooms[user.id] = userRooms[user.id].filter((room) => room !== user.room);

            // Enviar a lista de salas atualizada para o usuário
            socket.emit('roomList', userRooms[user.id]);
        }
    });
});

server.listen(port, () => {
    console.log(`Server is up on port ${port}!`);
});
