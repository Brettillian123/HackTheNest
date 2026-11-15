// Game routes, matched by method and path. api.js calls matchGameRoute() before its 404.
import { gameHandlers as h } from '../controller/gameController.js';
import { billingHandlers as b } from '../controller/billingController.js';

const routes = [
  ['GET', /^\/api\/health$/, h.health],
  ['GET', /^\/api\/challenges$/, h.listChallenges],
  ['GET', /^\/api\/challenges\/([^/]+)$/, h.getChallenge],
  ['GET', /^\/api\/challenges\/([^/]+)\/goal$/, h.getGoalViews],
  ['GET', /^\/api\/lessons$/, h.lessons],
  ['GET', /^\/api\/lessons\/([^/]+)$/, h.lesson],
  ['POST', /^\/api\/runs$/, h.createRun],
  ['POST', /^\/api\/runs\/([^/]+)\/score$/, h.scoreRun],
  ['GET', /^\/api\/attempts\/current$/, h.getCurrentAttempt],
  ['POST', /^\/api\/attempts\/start-over$/, h.startOver],
  ['POST', /^\/api\/attempts\/claim$/, h.claim],
  ['GET', /^\/api\/leaderboards$/, h.leaderboards],
  ['GET', /^\/api\/users\/([^/]+)$/, h.userProfile],
  ['GET', /^\/api\/players\/me$/, h.playersMe],
  ['GET', /^\/api\/billing\/summary$/, b.summary],
  ['POST', /^\/api\/billing\/checkout$/, b.checkout],
  ['POST', /^\/api\/billing\/confirm$/, b.confirm],
  ['POST', /^\/api\/billing\/webhook$/, b.webhook],
];

// Returns a (request, response) handler, or null when no game route matches.
export function matchGameRoute(method, pathname) {
  const path = typeof pathname === 'string' && pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  for (const [routeMethod, pattern, handler] of routes) {
    if (routeMethod !== method) continue;
    const match = pattern.exec(path);
    if (match) return (request, response) => handler(request, response, match.slice(1));
  }
  return null;
}
