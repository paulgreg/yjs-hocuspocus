import { Hocuspocus } from '@hocuspocus/server'
import fs from 'node:fs/promises'
import path from 'node:path'
import { yShapeToJSON } from './YShape.js'

export function encodeFileName(fileName: string): string {
  const normalized = fileName.normalize('NFD')
  const cleanFileName = normalized
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_.]/g, '_')
  return cleanFileName
}

export async function saveJsonToFile(
  backupDir: string,
  docName: string,
  json: any
): Promise<void> {
  await fs.mkdir(backupDir, { recursive: true })
  const fileName = encodeFileName(docName)
  const filePath = path.join(backupDir, `${fileName}.json`)
  const jsonString = JSON.stringify(json, null, 2)
  await fs.writeFile(filePath, jsonString, 'utf-8')
  console.log(`Backed up ${fileName} to ${filePath}`)
}

export async function backupAllDocs(
  hocuspocus: Hocuspocus,
  backupDir: string
): Promise<void> {
  console.log(new Date(), 'starting backup')
  try {
    const docs = hocuspocus.documents
    console.log(docs.size, 'documents found')
    for (const [_idx, ydoc] of docs.entries()) {
      const json = yShapeToJSON(ydoc)
      await saveJsonToFile(backupDir, ydoc.name, json)
    }
    console.log(new Date(), 'backup ended')
  } catch (e) {
    console.error('backup failed', e)
  }
}
