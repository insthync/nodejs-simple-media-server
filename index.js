const dotenv = require('dotenv');
const express = require('express');
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
const server = http.createServer(app);
const io = new Server(server);

io.on('connection', (socket) => {
  socket.on('current', (msg) => {
    // Response current media to the client
  });

  socket.on('play', (msg) => {

  });

  socket.on('pause', (msg) => {

  });

  socket.on('stop', (msg) => {

  });

  socket.on('seek', (msg) => {

  });
});

function validateUser(req, res, next) {
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
  next();
};

app.post('/upload', validateUser, async (req, res, next) => {
  try {
    if (!req.files) {
      // No files
      res.sendStatus(404);
    } else {
      // Get and move video file to upload path
      const video = req.files.video;
      const fileName = video.name;
      const savePath = './uploads/' + fileName;
      video.mv(savePath);

      const duration = await getVideoDurationInSeconds(
        savePath
      );

      const id = nanoid();
      // Store video to database
      await prisma.videos.create({
        data: {
          id: id,
          filePath: savePath,
          duration: duration,
        }
      });

      res.status(200).send();
    }
  } catch (err) {
    res.status(500).send(err);
  }
});

app.delete('/delete/:id', validateUser, async (req, res, next) => {
  await prisma.videos.delete({
    where: {
      id: req.query.id,
    }
  });
  res.status(200).send();
});

app.get('/', async (req, res) => {
  const videos = await prisma.videos.findMany();
  res.status(200).send(videos);
});

const port = Number(process.env.SERVER_PORT || 8216);
server.listen(port, () => {
  console.log("Simple media server listening on :" + port)
})