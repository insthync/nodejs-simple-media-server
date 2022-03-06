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
const deletingMediaIds = [];

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
      time: currentPlayList.time,
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
        time: currentPlayList.time,
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
        time: currentPlayList.time,
      });
    });
  });

  socket.on('stop', (msg) => {
    const playListId = msg.playListId;
    const currentPlayList = playLists[playListId];
    const currentPlayListSubscribers = playListSubscribers[playListId];
    currentPlayList.isPlaying = false;
    currentPlayList.time = 0;
    playLists[playListId] = currentPlayList;
    currentPlayListSubscribers.forEach(element => {
      element.emit("resp", {
        playListId: playListId,
        mediaId: currentPlayList.mediaId,
        isPlaying: currentPlayList.isPlaying,
        filePath: currentPlayList.filePath,
        time: currentPlayList.time,
      });
    });
  });

  socket.on('seek', (msg) => {
    const playListId = msg.playListId;
    const currentPlayList = playLists[playListId];
    const currentPlayListSubscribers = playListSubscribers[playListId];
    currentPlayList.time = msg.time;
    playLists[playListId] = currentPlayList;
    currentPlayListSubscribers.forEach(element => {
      element.emit("resp", {
        playListId: playListId,
        mediaId: currentPlayList.mediaId,
        isPlaying: currentPlayList.isPlaying,
        filePath: currentPlayList.filePath,
        time: currentPlayList.time,
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
      const playListId = req.body.playListId;
      const file = req.files.file;
      const fileName = file.name;
      const savePath = './uploads/' + id + '_' + fileName;
      file.mv(savePath);

      const duration = await getVideoDurationInSeconds(
        savePath
      );

      const lastVideo = await prisma.videos.findFirst({
        where: {
          playListId: playListId,
        },
        orderBy: {
          sortOrder: 'desc',
        },
      });

      // Store video to database
      const media = await prisma.videos.create({
        data: {
          id: id,
          playListId: playListId,
          filePath: savePath,
          duration: duration,
          sortOrder: lastVideo ? lastVideo.sortOrder + 1 : 1,
        },
      });

      // Create new playlist if it not existed
      if (!Object.hasOwnProperty.call(playLists, playListId)) {
        playLists[playListId] = {
          mediaId: media.id,
          mediaDuration: media.duration,
          filePath: media.filePath,
          isPlaying: true,
          time: 0,
        };
      }

      res.status(200).send();
    }
  } catch (err) {
    console.log(err);
    res.status(500).send(err);
  }
});

app.delete('/:id', validateUser, async (req, res, next) => {
  deletingMediaIds.push(req.query.id);
  res.status(200).send();
});

app.get('/:playListId', async (req, res) => {
  const videos = await prisma.videos.findMany({
    where: {
      playListId: playListId,
    },
    orderBy: {
      sortOrder: 'asc',
    },
  });
  res.status(200).send(videos);
});

// Playlist updating
let lastFrameTime = new Date().getTime();
async function playListsUpdate() {
  const currentTime = new Date().getTime();
  const deltaTime = currentTime - lastFrameTime;
  const deletingPlayLists = [];
  for (const playListId in playLists) {
    if (!Object.hasOwnProperty.call(playLists, playListId)) {
      continue;
    }
    const playList = playLists[playListId];
    if (!playList.isPlaying) {
      continue;
    }
    const indexOfDeletingMedia = deletingMediaIds.indexOf(playList.mediaId);
    playList.time += deltaTime;
    if (indexOfDeletingMedia >= 0 || playList.time >= playList.duration) {
      // Load new meida to play
      const medias = await prisma.videos.findMany({
        where: {
          playListId: playListId,
        }
      });
      // Find index of new media
      let indexOfNewMedia = -1;
      for (let index = 0; index < medias.length; index++) {
        const media = medias[index];
        if (media.id != playList.mediaId) {
          continue;
        }
        indexOfNewMedia = index + 1;
        if (indexOfNewMedia >= medias.length) {
          indexOfNewMedia = 0;
        }
        break;
      }
      // Delete the media after change to new video
      if (indexOfDeletingMedia >= 0) {
        deletingMediaIds.splice(indexOfDeletingMedia, 1);
        if (medias.length == 1) {
          indexOfNewMedia = -1;
        }
        await prisma.videos.delete({
          where: {
            id: playList.mediaId,
          },
        });
      }
      // Setup new media data to playlist
      if (indexOfNewMedia >= 0) {
        const media = medias[indexOfNewMedia];
        playList.mediaId = media.id;
        playList.mediaDuration = media.duration;
        playList.filePath = media.filePath;
        playList.isPlaying = true;
        playList.time = 0;
        console.log('play new media ' + indexOfNewMedia);
      } else {
        deletingPlayLists.push(playListId);
        console.log('delete empty playlist ' + playListId);
      }
    }
  }
  // Delete empty playlists
  for (const playListId of deletingPlayLists) {
    delete playLists[playListId];
  }
  lastFrameTime = currentTime;
}

async function init() {
  // Prepare playlists
  const videos = await prisma.videos.findMany({
    orderBy: {
      sortOrder: 'asc',
    },
  });
  for (const media of videos) {
    // Store playlist data
    if (Object.hasOwnProperty.call(playLists, media.playListId)) {
      continue;
    }
    playLists[media.playListId] = {
      mediaId: media.mediaId,
      duration: media.duration,
      filePath: media.filePath,
      isPlaying: true,
      time: 0,
    };
  }

  // Updating video playing
  setInterval(playListsUpdate, 250);
}

init();

const port = Number(process.env.SERVER_PORT || 8216);
server.listen(port, () => {
  console.log("Simple media server listening on :" + port)
});