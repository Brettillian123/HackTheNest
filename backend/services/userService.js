import { ObjectId } from 'mongodb';
import { getDatabase } from '../config/database.js';
import { User } from '../model/user.js';
import { hashPassword, verifyPassword } from './passwordService.js';

function publicUser(document) {
  return { id: document._id.toString(), username: document.username, email: document.email };
}

export async function createUser({ username, email, password }) {
  const normalizedUsername = username.trim();
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(normalizedUsername)) {
    throw new Error('Username must be 3–24 characters and use only letters, numbers, or underscores.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Enter a valid email address.');
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new Error('Password must be between 8 and 128 characters.');
  }

  const database = await getDatabase();
  const users = database.collection('users');
  await users.createIndex({ email: 1 }, { unique: true, name: 'unique_user_email' });
  await users.createIndex({ username: 1 }, { unique: true, name: 'unique_username' });

  const id = new ObjectId();
  const user = new User({ id, username: normalizedUsername, email: normalizedEmail, password: await hashPassword(password) });
  const document = { _id: user.id, username: user.username, email: user.email, password: user.password };
  await users.insertOne(document);
  return publicUser(document);
}

export async function authenticateUser({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  const database = await getDatabase();
  const document = await database.collection('users').findOne({ email: normalizedEmail });
  if (!document || !(await verifyPassword(password, document.password))) return null;
  return publicUser(document);
}
