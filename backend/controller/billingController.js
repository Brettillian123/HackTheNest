// HTTP handlers for credits and Stripe Checkout (rules in services/billingService.js).
import { HttpError, guarded, readJson, sendJson } from './http.js';
import { getDeps } from '../services/deps.js';
import { optionalPlayer, sessionUser } from '../services/playerService.js';
import { billingSummary, confirmCheckout, createCheckout, handleWebhook } from '../services/billingService.js';

function requireUser(request) {
  const user = sessionUser(request);
  if (!user) throw new HttpError(401, 'Log in to buy credits.');
  return user;
}

const summary = guarded('Billing summary', async (request, response) => {
  sendJson(response, 200, await billingSummary(request, optionalPlayer(request), getDeps()));
});

const checkout = guarded('Billing checkout', async (request, response) => {
  const user = requireUser(request);
  const input = await readJson(request, 4_000);
  sendJson(response, 200, await createCheckout(request, user, input.pack, getDeps()));
});

const confirm = guarded('Billing confirm', async (request, response) => {
  const user = requireUser(request);
  const input = await readJson(request, 4_000);
  sendJson(response, 200, await confirmCheckout(user, input.sessionId, getDeps()));
});

// Reads the raw body itself (no readJson) so the signature is checked against the exact bytes.
const webhook = guarded('Billing webhook', async (request, response) => {
  sendJson(response, 200, await handleWebhook(request, getDeps()));
});

export const billingHandlers = { summary, checkout, confirm, webhook };
