let io = null;

function setIO(socketIO) {
    io = socketIO;
}

function getIO() {
    return io;
}

module.exports = { setIO, getIO };