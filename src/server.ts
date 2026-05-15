import { Hono } from 'hono'
import { WebSocketServer } from 'ws'
import { serve, upgradeWebSocket } from '@hono/node-server'
import { Hocuspocus } from '@hocuspocus/server'
import { SQLite } from '@hocuspocus/extension-sqlite'
import { Logger } from '@hocuspocus/extension-logger'
import { backupAllDocs } from './extensions/backup.js'
import 'dotenv/config'

const PORT = process.env.PORT
const SECRET = process.env.SECRET
const BACKUP_DIR = process.env.BACKUP_DIR
const BACKUP_INTERVAL = process.env.BACKUP_INTERVAL

if (!PORT) throw new Error('Missing PORT')
if (!SECRET) throw new Error('Missing SECRET')

const hocuspocus = new Hocuspocus({
  debounce: 5_000,
  maxDebounce: 30_000,
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

const app = new Hono()

// Authentication middleware
const verifyAuth = (c: any, next: any) => {
  const token = c.req.query('secret')
  if (!token || token !== SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  return next()
}

// WebSocket endpoint for Hocuspocus
app.get(
  '/',
  upgradeWebSocket((c) => {
    let clientConnection: any
    return {
      onOpen(_evt, ws) {
        ws.binaryType = 'arraybuffer'
        clientConnection = hocuspocus.handleConnection(ws, c.req.raw, {
          // user_id: 1234,
        })
      },
      onMessage(evt, ws) {
        if (evt.data instanceof ArrayBuffer) {
          // Handle binary messages (ArrayBuffer)
          clientConnection?.handleMessage(new Uint8Array(evt.data))
        }
      },
      onClose() {
        clientConnection?.handleClose()
      },
      onError(error) {
        console.error('WebSocket error:', error)
      },
    }
  })
)

// GET /api/list?prefix=<prefix> - list documents
app.get('/api/list', verifyAuth, async (c) => {
  try {
    const prefix = c.req.query('prefix')
    if (!prefix) {
      return c.json({ error: 'Missing prefix parameter' }, 400)
    }

    const docs = Array.from(hocuspocus.documents.keys())
    const filter =
      prefix === '*' ? docs : docs.filter((name) => name.includes(prefix))

    return c.json(filter)
  } catch (error) {
    console.error('List error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// DELETE /api/delete?doc=<docName> - delete document
app.delete('/api/delete', verifyAuth, async (c) => {
  try {
    const docName = c.req.query('doc')
    if (!docName) {
      return c.json({ error: 'Missing doc parameter' }, 400)
    }
    console.log(`Deleting document: ${docName}`)
    hocuspocus.documents.delete(docName)
    return c.json({ success: true })
  } catch (error) {
    console.error('Delete error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Create WebSocket server
const wss = new WebSocketServer({ noServer: true })

console.log(`HopusPocus running at http://localhost:${PORT}/`)
serve(
  {
    fetch: app.fetch,
    websocket: { server: wss },
    port: Number.parseInt(PORT),
  },
  (info) => {
    hocuspocus.hooks('onListen', {
      instance: hocuspocus,
      configuration: hocuspocus.configuration,
      port: info.port,
    })
  }
)

if (BACKUP_DIR && BACKUP_INTERVAL) {
  const backupInterval = Number.parseInt(BACKUP_INTERVAL, 10)
  if (!Number.isInteger(backupInterval))
    throw new Error('BACKUP_INTERVAL_MS is not an integer')

  console.info(
    `backing up documents to "${BACKUP_DIR}" each ${BACKUP_INTERVAL} sec`
  )
  setInterval(
    () => backupAllDocs(hocuspocus, BACKUP_DIR),
    backupInterval * 1000
  )
}
