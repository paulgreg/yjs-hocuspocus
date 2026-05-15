import { Hono, type Context, type Next } from 'hono'
import { cors } from 'hono/cors'
import { WebSocketServer } from 'ws'
import { serve, upgradeWebSocket } from '@hono/node-server'
import { Hocuspocus } from '@hocuspocus/server'
import { SQLite } from '@hocuspocus/extension-sqlite'
import { Logger } from '@hocuspocus/extension-logger'
import { backupAllDocs } from './extensions/backup.js'
import { getDocumentNames, deleteDocument } from './utils/database.js'
import 'dotenv/config'

const port = process.env.PORT
const origin = process.env.ORIGIN
const secret = process.env.SECRET
const backupDir = process.env.BACKUP_DIR
const backupInterval = process.env.BACKUP_INTERVAL

if (!port) throw new Error('Missing PORT')
if (!origin) throw new Error('Missing ORIGIN')
if (!secret) throw new Error('Missing SECRET')

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
    if (!token || token !== secret) {
      throw new Error('Unauthorized')
    }
  },
})

const app = new Hono()
app.use(
  '/api/*',
  cors({
    origin,
    allowMethods: ['GET', 'DELETE', 'OPTIONS'],
  })
)

// Authentication middleware
const verifyAuth = (c: Context, next: Next) => {
  const token = c.req.query('secret')
  if (!token || token !== secret) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  return next()
}

// WebSocket endpoint for Hocuspocus
app.get(
  '/ws',
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

    // Get documents from database instead of memory
    const documents = await getDocumentNames(hocuspocus, prefix || undefined)

    return c.json(documents)
  } catch (error) {
    console.error('List error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// DELETE /api/delete?doc=<docName> - delete document
app.get('/api/del', verifyAuth, async (c) => {
  try {
    const docName = c.req.query('doc')
    if (!docName) {
      return c.json({ error: 'Missing doc parameter' }, 400)
    }
    console.log(`Deleting document: ${docName}`)

    // Delete from database first
    const deletedFromDb = await deleteDocument(hocuspocus, docName)

    // Delete from memory if it exists
    const deletedFromMemory = hocuspocus.documents.delete(docName)

    if (deletedFromDb || deletedFromMemory) {
      return c.json({ success: true, deletedFromDb, deletedFromMemory })
    } else {
      return c.json({ error: 'Document not found' }, 404)
    }
  } catch (error) {
    console.error('Delete error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Create WebSocket server
const wss = new WebSocketServer({ noServer: true })

console.log(`HopusPocus running at http://127.0.0.1:${port}/`)
serve(
  {
    fetch: app.fetch,
    websocket: { server: wss },
    port: Number.parseInt(port),
  },
  (info) => {
    hocuspocus.hooks('onListen', {
      instance: hocuspocus,
      configuration: hocuspocus.configuration,
      port: info.port,
    })
  }
)

if (backupDir && backupInterval) {
  const secBackupInterval = Number.parseInt(backupInterval, 10)
  if (!Number.isInteger(secBackupInterval))
    throw new Error('BACKUP_INTERVAL_MS is not an integer')

  console.info(
    `backing up documents to "${backupDir}" each ${secBackupInterval} sec`
  )
  setInterval(
    () => backupAllDocs(hocuspocus, backupDir),
    secBackupInterval * 1000
  )
}
