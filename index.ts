import * as dotenv from 'dotenv'
import express from 'express'
import fileupload from 'express-fileupload'
import bodyParser from 'body-parser'
import cors from 'cors'
import fs from 'fs'
import https from 'https'
import http from 'http'
import morgan from 'morgan'
import { Server } from 'socket.io'
import { getVideoDurationInSeconds } from 'get-video-duration'
import { PrismaClient } from '@prisma/client'
import { nanoid } from 'nanoid'

dotenv.config()
const prisma = new PrismaClient()
const app = express()
app.use(morgan('combined'))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(cors())
app.use(fileupload())
app.use('/uploads', express.static('uploads'))

const port = Number(process.env.SERVER_PORT || 8000)
const useHttps = Number(process.env.USE_HTTPS || 0) > 0
const keyFilePath = process.env.HTTPS_KEY_FILE_PATH || ''
const certFilePath = process.env.HTTPS_CERT_FILE_PATH || ''
const httpsPort = Number(process.env.HTTPS_SERVER_PORT || 8080)

const io = new Server()
const httpServer = http.createServer(app)
io.attach(httpServer)
httpServer.listen(port, () => {
  console.log(`Simple media server is listening on ${port}`)
})

if (useHttps) {
  const httpsServer = https.createServer({
    key: fs.readFileSync(keyFilePath),
    cert: fs.readFileSync(certFilePath),
  }, app)
  io.attach(httpsServer)
  httpsServer.listen(httpsPort, () => {
    console.log(`Simple media server is listening on port ${httpsPort}`)
  })
}

const playLists: { [id: string]: any } = {}
const playListSubscribers: { [id: string]: any[] } = {}
const deletingMediaIds: string[] = []
const adminUserTokens: string[] = []

function sendResp(socket: any, playListId: any, currentPlayList: any) {
  socket.emit('resp', {
    playListId: playListId,
    mediaId: currentPlayList.mediaId,
    isPlaying: currentPlayList.isPlaying,
    filePath: currentPlayList.filePath,
    time: currentPlayList.time,
    volume: currentPlayList.volume,
    duration: currentPlayList.duration,
  })
}

io.on('connection', (socket) => {
  socket.on('disconnect', function () {
    for (const key in playListSubscribers) {
      if (Object.hasOwnProperty.call(playListSubscribers, key)) {
        const currentPlayListSubscribers = playListSubscribers[key]
        const index = currentPlayListSubscribers.indexOf(socket)
        if (index >= 0) {
          currentPlayListSubscribers.splice(index, 1)
        }
      }
    }
  })

  socket.on('sub', (msg) => {
    console.log(socket.id + ' requested to sub ' + msg.playListId)
    const playListId = msg.playListId
    if (!Object.hasOwnProperty.call(playListSubscribers, playListId)) {
      playListSubscribers[playListId] = []
    }
    const currentPlayListSubscribers = playListSubscribers[playListId]
    if (currentPlayListSubscribers.indexOf(socket) < 0) {
      currentPlayListSubscribers.push(socket)
      console.log(socket.id + ' sub ' + playListId)
    }
    // Find the playlist, if found then `resp`
    if (!Object.hasOwnProperty.call(playLists, playListId)) {
      return
    }
    const currentPlayList = playLists[playListId]
    // Response current media to the client
    sendResp(socket, playListId, currentPlayList)
  })

  socket.on('play', (msg) => {
    console.log(socket.id + ' requested to play ' + msg.playListId + ' by user: ' + msg.userToken)
    const userToken = msg.userToken
    if (adminUserTokens.indexOf(userToken) < 0) {
      return
    }
    const playListId = msg.playListId
    if (!Object.hasOwnProperty.call(playLists, playListId)) {
      return
    }
    const currentPlayList = playLists[playListId]
    if (!Object.hasOwnProperty.call(playListSubscribers, playListId)) {
      playListSubscribers[playListId] = []
    }
    const currentPlayListSubscribers = playListSubscribers[playListId]
    currentPlayList.isPlaying = true
    playLists[playListId] = currentPlayList
    currentPlayListSubscribers.forEach(element => {
      sendResp(element, playListId, currentPlayList)
    })
    console.log(socket.id + ' play ' + playListId)
  })

  socket.on('pause', (msg) => {
    console.log(socket.id + ' requested to pause ' + msg.playListId + ' by user: ' + msg.userToken)
    const userToken = msg.userToken
    if (adminUserTokens.indexOf(userToken) < 0) {
      return
    }
    const playListId = msg.playListId
    if (!Object.hasOwnProperty.call(playLists, playListId)) {
      return
    }
    const currentPlayList = playLists[playListId]
    if (!Object.hasOwnProperty.call(playListSubscribers, playListId)) {
      playListSubscribers[playListId] = []
    }
    const currentPlayListSubscribers = playListSubscribers[playListId]
    currentPlayList.isPlaying = false
    playLists[playListId] = currentPlayList
    currentPlayListSubscribers.forEach(element => {
      sendResp(element, playListId, currentPlayList)
    })
    console.log(socket.id + ' pause ' + playListId)
  })

  socket.on('stop', (msg) => {
    console.log(socket.id + ' requested to stop ' + msg.playListId + ' by user: ' + msg.userToken)
    const userToken = msg.userToken
    if (adminUserTokens.indexOf(userToken) < 0) {
      return
    }
    const playListId = msg.playListId
    if (!Object.hasOwnProperty.call(playLists, playListId)) {
      return
    }
    const currentPlayList = playLists[playListId]
    if (!Object.hasOwnProperty.call(playListSubscribers, playListId)) {
      playListSubscribers[playListId] = []
    }
    const currentPlayListSubscribers = playListSubscribers[playListId]
    currentPlayList.isPlaying = false
    currentPlayList.time = 0
    playLists[playListId] = currentPlayList
    currentPlayListSubscribers.forEach(element => {
      sendResp(element, playListId, currentPlayList)
    })
    console.log(socket.id + ' stop ' + playListId)
  })

  socket.on('seek', (msg) => {
    console.log(socket.id + ' requested to seek ' + msg.playListId + ' by user: ' + msg.userToken)
    const userToken = msg.userToken
    if (adminUserTokens.indexOf(userToken) < 0) {
      return
    }
    const playListId = msg.playListId
    if (!Object.hasOwnProperty.call(playLists, playListId)) {
      return
    }
    const currentPlayList = playLists[playListId]
    if (!Object.hasOwnProperty.call(playListSubscribers, playListId)) {
      playListSubscribers[playListId] = []
    }
    const currentPlayListSubscribers = playListSubscribers[playListId]
    currentPlayList.time = msg.time
    playLists[playListId] = currentPlayList
    currentPlayListSubscribers.forEach(element => {
      sendResp(element, playListId, currentPlayList)
    })
    console.log(socket.id + ' seek ' + playListId)
  })

  socket.on('volume', (msg) => {
    console.log(socket.id + ' requested to volume ' + msg.playListId + ' by user: ' + msg.userToken)
    const userToken = msg.userToken
    if (adminUserTokens.indexOf(userToken) < 0) {
      return
    }
    const playListId = msg.playListId
    if (!Object.hasOwnProperty.call(playLists, playListId)) {
      return
    }
    const currentPlayList = playLists[playListId]
    if (!Object.hasOwnProperty.call(playListSubscribers, playListId)) {
      playListSubscribers[playListId] = []
    }
    const currentPlayListSubscribers = playListSubscribers[playListId]
    currentPlayList.volume = msg.volume
    playLists[playListId] = currentPlayList
    currentPlayListSubscribers.forEach(element => {
      sendResp(element, playListId, currentPlayList)
    })
    console.log(socket.id + ' volume ' + playListId)
  })

  socket.on('switch', async (msg) => {
    console.log(socket.id + ' requested to switch ' + msg.playListId + ' by user: ' + msg.userToken)
    const userToken = msg.userToken
    if (adminUserTokens.indexOf(userToken) < 0) {
      return
    }
    const playListId = msg.playListId
    if (!Object.hasOwnProperty.call(playLists, playListId)) {
      return
    }
    const currentPlayList = playLists[playListId]
    if (!Object.hasOwnProperty.call(playListSubscribers, playListId)) {
      playListSubscribers[playListId] = []
    }
    const mediaId = msg.mediaId
    const media = await prisma.videos.findFirst({
      where: {
        id: mediaId,
        playListId: playListId,
      },
    })
    // Can't find the media
    if (!media) {
      return
    }
    // Switch media
    currentPlayList.mediaId = mediaId
    currentPlayList.isPlaying = true
    currentPlayList.filePath = media.filePath
    currentPlayList.time = 0
    currentPlayList.duration = media.duration
    const currentPlayListSubscribers = playListSubscribers[playListId]
    playLists[playListId] = currentPlayList
    currentPlayListSubscribers.forEach(element => {
      sendResp(element, playListId, currentPlayList)
    })
    console.log(socket.id + ' switch ' + playListId)
  })
})

function validateSystem(req: express.Request, res: express.Response, next: express.NextFunction) {
  const bearerHeader = req.headers['authorization']
  if (!bearerHeader) {
    res.sendStatus(400)
    return
  }
  // Substring `bearer `, length is 7
  const bearerToken = bearerHeader.substring(7)
  const secretKeys = JSON.parse(process.env.SECRET_KEYS || "[]")
  if (secretKeys.indexOf(bearerToken) < 0) {
    res.sendStatus(400)
    return
  }
  next()
}

function validateUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  const bearerHeader = req.headers['authorization']
  if (!bearerHeader) {
    res.sendStatus(400)
    return
  }
  // Substring `bearer `, length is 7
  const bearerToken = bearerHeader.substring(7)
  if (adminUserTokens.indexOf(bearerToken) < 0) {
    res.sendStatus(400)
    return
  }
  next()
}

app.post('/add-user', validateSystem, async (req, res) => {
  const userToken = req.body.userToken
  if (adminUserTokens.indexOf(userToken) < 0) {
    adminUserTokens.push(userToken)
  }
  res.sendStatus(200)
})

app.post('/remove-user', validateSystem, async (req, res) => {
  const userToken = req.body.userToken
  const index = adminUserTokens.indexOf(userToken)
  if (index >= 0) {
    adminUserTokens.splice(index, 1)
  }
  res.sendStatus(200)
})

app.post('/upload', validateUser, async (req: express.Request, res: express.Response) => {
  try {
    if (!req.files) {
      // No files
      res.sendStatus(404)
    } else {
      // Get and move video file to upload path
      const id = nanoid()
      const playListId: string = req.body.playListId
      const file: fileupload.UploadedFile = req.files.file as fileupload.UploadedFile
      const fileName = file.name
      const savePath = './uploads/' + id + '_' + fileName
      const fullSavePath = process.cwd() + '/uploads/' + id + '_' + fileName
      await file.mv(fullSavePath)

      const duration = await getVideoDurationInSeconds(
        fullSavePath
      )

      const lastVideo = await prisma.videos.findFirst({
        where: {
          playListId: playListId,
        },
        orderBy: {
          sortOrder: 'desc',
        },
      })

      // Store video to database
      const media = await prisma.videos.create({
        data: {
          id: id,
          playListId: playListId,
          filePath: savePath,
          duration: duration,
          sortOrder: lastVideo ? lastVideo.sortOrder + 1 : 1,
        },
      })

      // Create new playlist if it not existed
      if (!Object.hasOwnProperty.call(playLists, playListId)) {
        playLists[playListId] = {
          mediaId: media.id,
          mediaDuration: media.duration,
          filePath: media.filePath,
          isPlaying: true,
          time: 0,
        }
      }

      if (!lastVideo) {
        // This is first video
        if (!Object.hasOwnProperty.call(playListSubscribers, playListId)) {
          playListSubscribers[playListId] = []
        }
        const currentPlayListSubscribers = playListSubscribers[playListId]
        for (const currentPlayListSubscriber of currentPlayListSubscribers) {
          currentPlayListSubscriber.emit('resp', {
            playListId: playListId,
            mediaId: media.id,
            isPlaying: true,
            filePath: savePath,
            time: 0,
            duration: duration,
          })
        }
      }

      res.status(200).send()
    }
  } catch (err) {
    console.error(err)
    res.status(500).send(err)
  }
})

app.delete('/:id', validateUser, async (req, res) => {
  deletingMediaIds.push(req.params.id)
  res.status(200).send()
})

app.get('/:playListId', async (req, res) => {
  const videos = await prisma.videos.findMany({
    where: {
      playListId: req.params.playListId,
    },
    orderBy: {
      sortOrder: 'asc',
    },
  })
  // Don't include deleting media
  for (let index = videos.length - 1; index >= 0; --index) {
    const video = videos[index]
    if (deletingMediaIds.indexOf(video.id) >= 0) {
      videos.splice(index, 1)
    }
  }
  res.status(200).send(videos)
})

// Playlist updating
let lastFrameTime = new Date().getTime()
async function playListsUpdate() {
  const currentTime = new Date().getTime()
  const deltaTime = currentTime - lastFrameTime
  const deletingPlayLists = []
  for (const playListId in playLists) {
    if (!Object.hasOwnProperty.call(playLists, playListId)) {
      continue
    }
    const playList = playLists[playListId]
    if (!playList.isPlaying) {
      continue
    }
    const indexOfDeletingMedia = deletingMediaIds.indexOf(playList.mediaId)
    playList.time += deltaTime * 0.001
    if (indexOfDeletingMedia >= 0 || playList.time >= playList.duration) {
      // Load new meida to play
      const medias = await prisma.videos.findMany({
        where: {
          playListId: playListId,
        },
        orderBy: {
          sortOrder: 'asc',
        },
      })
      // Find index of new media
      let indexOfNewMedia = -1
      for (let index = 0; index < medias.length; ++index) {
        const media = medias[index]
        if (media.id != playList.mediaId) {
          continue
        }
        indexOfNewMedia = index + 1
        if (indexOfNewMedia >= medias.length) {
          indexOfNewMedia = 0
        }
        break
      }
      // Delete the media after change to new video
      if (indexOfDeletingMedia >= 0) {
        deletingMediaIds.splice(indexOfDeletingMedia, 1)
        if (medias.length == 1) {
          indexOfNewMedia = -1
        }
        await prisma.videos.delete({
          where: {
            id: playList.mediaId,
          },
        })
      }
      // Setup new media data to playlist
      if (indexOfNewMedia >= 0) {
        const media = medias[indexOfNewMedia]
        playList.mediaId = media.id
        playList.duration = media.duration
        playList.filePath = media.filePath
        playList.isPlaying = true
        playList.time = 0
        if (Object.hasOwnProperty.call(playListSubscribers, playListId)) {
          for (const subscriber of playListSubscribers[playListId]) {
            subscriber.emit('resp', {
              playListId: playListId,
              mediaId: playList.mediaId,
              isPlaying: playList.isPlaying,
              filePath: playList.filePath,
              time: playList.time,
              volume: playList.volume,
              duration: playList.duration,
            })
          }
        }
      } else {
        deletingPlayLists.push(playListId)
        if (Object.hasOwnProperty.call(playListSubscribers, playListId)) {
          for (const subscriber of playListSubscribers[playListId]) {
            subscriber.emit('resp', {
              playListId: playListId,
              mediaId: '',
              isPlaying: false,
              filePath: '',
              time: 0,
              volume: 0,
              duration: 0,
            })
          }
        }
      }
    }
  }
  // Delete empty playlists
  for (const playListId of deletingPlayLists) {
    delete playLists[playListId]
  }
  lastFrameTime = currentTime
}

async function init() {
  // Prepare playlists
  const videos = await prisma.videos.findMany({
    orderBy: {
      sortOrder: 'asc',
    },
  })
  for (const media of videos) {
    // Store playlist data
    if (Object.hasOwnProperty.call(playLists, media.playListId)) {
      continue
    }
    playLists[media.playListId] = {
      mediaId: media.id,
      duration: media.duration,
      filePath: media.filePath,
      isPlaying: true,
      time: 0,
      volume: 1,
    }
  }

  // Updating video playing
  setInterval(playListsUpdate, 250)
}

init()