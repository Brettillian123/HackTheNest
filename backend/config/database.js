import { MongoClient } from 'mongodb';

let clientPromise;
let databaseOverride = null;

// Tests only: makes getDatabase() return an in-memory stand-in (null restores MongoDB).
export function setDatabaseOverride(database) {
  databaseOverride = database;
}

export async function getDatabase() {
  if (databaseOverride) return databaseOverride;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not configured. Add it to the project root .env file.');

  if (!clientPromise) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    clientPromise = client.connect().catch(error => {
      clientPromise = undefined;
      throw error;
    });
  }

  const client = await clientPromise;
  return client.db();
}
