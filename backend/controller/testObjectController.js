import { createTestObject } from '../services/testObjectService.js';

export async function handleCreateTestObject(_request, response) {
  try {
    const testObject = await createTestObject();
    response.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ testObject }));
  } catch (error) {
    console.error('Failed to create test object:', error.name, error.code || error.cause?.code || error.message);
    const notConfigured = error.message.startsWith('MONGODB_URI is not configured');
    const tlsHandshakeFailed = /SSL|TLS|tlsv1 alert/i.test(error.message);
    const message = notConfigured
      ? error.message
      : tlsHandshakeFailed
        ? 'MongoDB rejected the TLS connection. If this is Atlas, add this computer’s public IP under Network Access → IP Access List, confirm the cluster is active, and allow outbound TCP port 27017.'
        : 'Could not connect to MongoDB. Check the URI, Atlas IP access list, cluster status, and database credentials.';
    response.writeHead(notConfigured ? 503 : 502, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: message }));
  }
}
