import { Hocuspocus, Extension } from '@hocuspocus/server'
import { SQLite } from '@hocuspocus/extension-sqlite'
import * as Y from 'yjs'
import type { Database as BetterSqlite3Database, RunResult } from 'better-sqlite3'

/**
 * Database document schema based on the actual SQLite schema:
 * CREATE TABLE documents (name varchar(255) NOT NULL, data blob NOT NULL, UNIQUE(name))
 */
export interface DocumentRecord {
  name: string;
  data: Uint8Array;
}

/**
 * Get the BetterSqlite3 database connection from the Hocuspocus instance
 * @param hocuspocus Hocuspocus instance
 * @returns BetterSqlite3 Database instance
 * @throws Error if SQLite extension is not properly configured
 */
export function getDatabaseConnection(hocuspocus: Hocuspocus): BetterSqlite3Database {
  // Get the SQLite extension instance from configuration
  const sqliteExtension = hocuspocus.configuration.extensions.find(
    (ext: Extension) => ext instanceof SQLite
  ) as SQLite | undefined;

  if (!sqliteExtension?.db) {
    throw new Error('SQLite extension not properly configured');
  }

  return sqliteExtension.db;
}

/**
 * Get all document names from the database, optionally filtered by prefix
 * @param hocuspocus Hocuspocus instance
 * @param prefix Optional prefix filter for document names
 * @returns Array of document names
 */
export async function getDocumentNames(hocuspocus: Hocuspocus, prefix?: string): Promise<string[]> {
  const db = getDatabaseConnection(hocuspocus);

  let query = 'SELECT name FROM documents';
  const params: string[] = [];

  if (prefix) {
    query += ' WHERE name LIKE ?';
    params.push(`${prefix}%`);
  }

  query += ' ORDER BY name';

  try {
    // Use generic typing for the query result
    const rows = db.prepare<[string?], { name: string }>(query).all(...params);
    return rows.map(row => row.name);
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

/**
 * Delete a document from the database
 * @param hocuspocus Hocuspocus instance
 * @param name Document name to delete
 * @returns true if document was deleted, false if not found
 */
export async function deleteDocument(hocuspocus: Hocuspocus, name: string): Promise<boolean> {
  const db = getDatabaseConnection(hocuspocus);

  try {
    // Use transaction for atomic operation with proper typing
    const result = db.prepare<[string], RunResult>('DELETE FROM documents WHERE name = ?').run(name);
    return result.changes > 0;
  } catch (error) {
    console.error('Database delete error:', error);
    throw error;
  }
}

/**
 * Load a Y.js document from the database
 * @param hocuspocus Hocuspocus instance
 * @param docName Document name to load
 * @returns Y.js document instance
 * @throws Error if document not found or data is invalid
 */
export async function loadDocumentFromDb(hocuspocus: Hocuspocus, docName: string): Promise<Y.Doc> {
  const db = getDatabaseConnection(hocuspocus);

  try {
    // Use generic typing for the query result
    const row = db.prepare<[string], DocumentRecord | undefined>('SELECT data FROM documents WHERE name = ?').get(docName);
    
    if (!row || !row.data) {
      throw new Error(`Document ${docName} not found in database`);
    }

    const yDoc = new Y.Doc();
    Y.applyUpdate(yDoc, row.data);
    return yDoc;
  } catch (error) {
    console.error(`Failed to load document ${docName} from database:`, error);
    throw error;
  }
}

/**
 * Check if a document exists in the database
 * @param hocuspocus Hocuspocus instance
 * @param docName Document name to check
 * @returns true if document exists, false otherwise
 */
export async function documentExists(hocuspocus: Hocuspocus, docName: string): Promise<boolean> {
  const db = getDatabaseConnection(hocuspocus);

  try {
    const row = db.prepare<[string], { count: number }>('SELECT COUNT(*) as count FROM documents WHERE name = ?').get(docName);
    return (row?.count ?? 0) > 0;
  } catch (error) {
    console.error(`Failed to check if document ${docName} exists:`, error);
    throw error;
  }
}
