import { ObjectId } from 'mongodb';
import { randomInt } from 'node:crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function createTestObjectDocument() {
  const length = randomInt(4, 11);
  let randomString = '';
  for (let index = 0; index < length; index += 1) {
    randomString += alphabet[randomInt(0, alphabet.length)];
  }
  return { _id: new ObjectId(), randomString };
}
