import { Hocuspocus } from '@hocuspocus/server'
import fs from 'node:fs/promises'
import path from 'path'
import { yShapeToJSON } from './YShape.js'
import { getDocumentNames, loadDocumentFromDb } from '../utils/database.js'

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
    // Get document names from database instead of memory
    const docNames = await getDocumentNames(hocuspocus)
    console.log(docNames.length, 'documents found in database')
    
    let successCount = 0
    let errorCount = 0
    
    for (const docName of docNames) {
      try {
        // Load document from database
        const ydoc = await loadDocumentFromDb(hocuspocus, docName)
        const json = yShapeToJSON(ydoc)
        await saveJsonToFile(backupDir, docName, json)
        successCount++
      } catch (error) {
        console.error(`Failed to backup document ${docName}:`, error)
        errorCount++
      }
    }
    
    console.log(new Date(), `backup ended: ${successCount} succeeded, ${errorCount} failed`)
  } catch (e) {
    console.error('backup failed', e)
  }
}
