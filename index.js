const dotenv = require('dotenv');
const express = require('express');
const fileupload = require("express-fileupload");
const bodyParser = require('body-parser');
const http = require('http');
const morgan = require('morgan');
const { Server } = require("socket.io");
const { getVideoDurationInSeconds } = require('get-video-duration');
const { PrismaClient } = require('@prisma/client');
const { nanoid } = require('nanoid');

dotenv.config();
const prisma = new PrismaClient();
const app = express();
app.use(morgan('combined'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(fileupload());
const server = http.createServer(app);
const io = new Server(server);

const playLists = {};
const playListSubscribers = {};

io.on('connection', (socket) => {
  socket.on('sub', (msg) => {
    const playListId = msg.playListId;
    const currentPlayList = playLists[playListId];
    const currentPlayListSubscribers = playListSubscribers[playListId];
    currentPlayListSubscribers.push(socket);
    // Response current media to the client
    socket.emit("resp", {
      playListId: playListId,
      mediaId: currentPlayList.mediaId,
      isPlaying: currentPlayList.isPlaying,
      filePath: currentPlayList.filePath,
      position: currentPlayList.position,
    });
  });

  socket.on('play', (msg) => {
    const playListId = msg.playListId;
    const currentPlayList = playLists[playListId];
    const currentPlayListSubscribers = playListSubscribers[playListId];
    currentPlayList.isPlaying = true;
    playLists[playListId] = currentPlayList;
    currentPlayListSubscribers.forEach(element => {
      element.emit("resp", {
        playListId: playListId,
        mediaId: currentPlayList.mediaId,
        isPlaying: currentPlayList.isPlaying,
        filePath: currentPlayList.filePath,
        position: currentPlayList.position,
      });
    });
  });

  socket.on('pause', (msg) => {
    const playListId = msg.playListId;
    const currentPlayList = playLists[playListId];
    const currentPlayListSubscribers = playListSubscribers[playListId];
    currentPlayList.isPlaying = false;
    playLists[playListId] = currentPlayList;
    currentPlayListSubscribers.forEach(element => {
      element.emit("resp", {
        playListId: playListId,
        mediaId: currentPlayList.mediaId,
        isPlaying: currentPlayList.isPlaying,
        filePath: currentPlayList.filePath,
        position: currentPlayList.position,
      });
    });
  });

  socket.on('stop', (msg) => {
    const playListId = msg.playListId;
    const currentPlayList = playLists[playListId];
    const currentPlayListSubscribers = playListSubscribers[playListId];
    currentPlayList.isPlaying = false;
    currentPlayList.position = 0;
    playLists[playListId] = currentPlayList;
    currentPlayListSubscribers.forEach(element => {
      element.emit("resp", {
        playListId: playListId,
        mediaId: currentPlayList.mediaId,
        isPlaying: currentPlayList.isPlaying,
        filePath: currentPlayList.filePath,
        position: currentPlayList.position,
      });
    });
  });

  socket.on('seek', (msg) => {
    const playListId = msg.playListId;
    const currentPlayList = playLists[playListId];
    const currentPlayListSubscribers = playListSubscribers[playListId];
    currentPlayList.position = msg.position;
    playLists[playListId] = currentPlayList;
    currentPlayListSubscribers.forEach(element => {
      element.emit("resp", {
        playListId: playListId,
        mediaId: currentPlayList.mediaId,
        isPlaying: currentPlayList.isPlaying,
        filePath: currentPlayList.filePath,
        position: currentPlayList.position,
      });
    });
  });
});

function validateUser(req, res, next) {
  /*
  // Validate connection by secret key which will be included in header -> authorization
  // TODO: Implements middleware if there are more than 1 function which will validate authorization like this
  const bearerHeader = req.headers['authorization']
  if (!bearerHeader) {
    res.sendStatus(400)
    return;
  }
  // Substring `bearer `, length is 7
  const bearerToken = bearerHeader.substring(7)
  const secretKeys = JSON.parse(process.env.SECRET_KEYS || "[]")
  if (secretKeys.indexOf(bearerToken) < 0) {
    res.sendStatus(400)
    return;
  }
  */
  next();
};

app.post('/upload', validateUser, async (req, res, next) => {
  try {
    if (!req.files) {
      // No files
      res.sendStatus(404);
    } else {
      // Get and move video file to upload path
      const id = nanoid();
      const file = req.files.file;
      const fileName = file.name;
      const savePath = './uploads/' + id + '_' + fileName;
      file.mv(savePath);

      const duration = await getVideoDurationInSeconds(
        savePath
      );

      const countVideos = await prisma.videos.count({
        where: {
          playListId: req.body.playListId,
        }
      })

      // Store video to database
      await prisma.videos.create({
        data: {
          id: id,
          playListId: req.body.playListId,
          filePath: savePath,
          duration: duration,
          sortOrder: countVideos,
        }
      });

      res.status(200).send();
    }
  } catch (err) {
    console.log(err);
    res.status(500).send(err);
  }
});

app.delete('/:id', validateUser, async (req, res, next) => {
  await prisma.videos.delete({
    where: {
      id: req.query.id,
    }
  });
  res.status(200).send();
});

app.get('/:playListId', async (req, res) => {
  const videos = await prisma.videos.findMany({
    where: {
      playListId: playListId,
    },
    orderBy: {
      sortOrder: 'asc'
    }
  });
  res.status(200).send(videos);
});

const port = Number(process.env.SERVER_PORT || 8216);
server.listen(port, () => {
  console.log("Simple media server listening on :" + port)
});