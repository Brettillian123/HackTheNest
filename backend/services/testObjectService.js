import { getDatabase } from '../config/database.js';
import { createTestObjectDocument } from '../model/testObject.js';

export async function createTestObject() {
  const database = await getDatabase();
  const document = createTestObjectDocument();
  const result = await database.collection('testObjects').insertOne(document);
  return { id: result.insertedId.toString(), randomString: document.randomString };
}
