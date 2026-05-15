import { SQLite } from '@hocuspocus/extension-sqlite'
import { Logger } from '@hocuspocus/extension-logger'
import { Hocuspocus, type WebSocketLike } from '@hocuspocus/server'
import { createServer } from 'node:http'
import crossws from 'crossws/adapters/node'
import express from 'express'
import 'dotenv/config'

const PORT = process.env.PORT_WS
const SECRET = process.env.SECRET

if (!PORT) throw new Error('Missing PORT')
if (!SECRET) throw new Error('Missing SECRET')

function verifyAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const token = req.query.secret
  if (!token || token !== SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

const hocuspocus = new Hocuspocus({
  debounce: 5000,
  maxDebounce: 30000,
  extensions: [
    new SQLite({
      database: './data/hocuspocus.db',
    }),
    new Logger(),
  ],
  async onAuthenticate({ token }) {
    if (!token || token !== SECRET) {
      throw new Error('Unauthorized')
    }
  },
})

const ws = crossws({
  hooks: {
    open(peer) {
      const clientConnection = hocuspocus.handleConnection(
        peer.websocket as unknown as WebSocketLike,
        peer.request,
        {
          user_id: 1234,
        }
      )
      ;(peer as any)._hocuspocus = clientConnection
    },
    message(peer, message) {
      ;(peer as any)._hocuspocus?.handleMessage(message.uint8Array())
    },
    close(peer, event) {
      ;(peer as any)._hocuspocus?.handleClose({
        code: event.code,
        reason: event.reason,
      })
    },
    error(peer, error) {
      console.error('WebSocket error for peer:', peer.id)
      console.error(error)
    },
  },
})

const app = express()
app.use(express.json())

// GET /list?prefix=<prefix> - list documents
app.get('/api/list', verifyAuth, async (req, res) => {
  try {
    const prefix = req.query.prefix
    if (!prefix) {
      return res.status(400).json({ error: 'Missing prefix parameter' })
    }

    const docs = Array.from(hocuspocus.documents.keys())
    const filter =
      prefix === '*'
        ? docs
        : docs.filter((name) => name.includes(prefix as string))

    res.json(filter)
  } catch (error) {
    console.error('List error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/delete?doc=<docName> - delete document
app.delete('/api/delete', verifyAuth, async (req, res) => {
  try {
    const docName = req.query.doc as string
    if (!docName) {
      return res.status(400).json({ error: 'Missing doc parameter' })
    }
    console.log(`Deleting document: ${docName}`)
    hocuspocus.documents.delete(docName)
    res.json({ success: true })
  } catch (error) {
    console.error('Delete error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

const server = createServer(app)
server.on('upgrade', (request, socket, head) => {
  ws.handleUpgrade(request, socket, head)
})

server.listen(Number.parseInt(PORT), () => {
  console.log(`HopusPocus running at http://localhost:${PORT}/`)
})
