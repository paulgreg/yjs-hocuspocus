import { Hocuspocus } from '@hocuspocus/server'
import fs from 'node:fs/promises'
import path from 'node:path'
import { yShapeToJSON } from './YShape.js'
import {
  getDocumentNames,
  loadDocumentFromDb,
  isDocumentEmpty,
} from '../utils/database.js'

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

/**
 * Backup all non-empty documents to JSON files
 * @param hocuspocus Hocuspocus instance
 * @param backupDir Directory to save backup files
 * @param cleanupEmptyDocs Whether to cleanup unused empty documents before backup (default: true)
 */
export async function backupAllDocs(
  hocuspocus: Hocuspocus,
  backupDir: string
): Promise<void> {
  console.log(new Date(), 'starting backup')
  try {
    // Step 1: Get remaining document names from database
    const docNames = await getDocumentNames(hocuspocus)
    console.log(`📋 ${docNames.length} documents found in database for backup`)

    let successCount = 0
    let errorCount = 0
    let skipCount = 0

    // Step 2: Backup non-empty documents
    for (const docName of docNames) {
      try {
        // Check if document is empty and skip it
        const isEmpty = await isDocumentEmpty(hocuspocus, docName)
        if (isEmpty) {
          console.log(`🗑️  Skipping empty document: ${docName}`)
          skipCount++
          continue
        }

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

    console.log(
      new Date(),
      `backup ended: ${successCount} succeeded, ${errorCount} failed, ${skipCount} empty documents skipped`
    )
  } catch (e) {
    console.error('backup failed', e)
  }
}
