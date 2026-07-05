const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

test('schedule route registers authenticated AI generation endpoint', () => {
  const routeSource = fs.readFileSync(
    path.join(repoRoot, 'routes', 'scheduleRoutes.js'),
    'utf8'
  );

  assert.match(routeSource, /router\.use\(authMiddleware\)/);
  assert.match(routeSource, /router\.post\('\/generate-ai', scheduleController\.generateAISchedule\)/);
  assert.match(routeSource, /router\.post\('\/generate', scheduleController\.generateSchedule\)/);
  assert.match(routeSource, /router\.get\('\/', scheduleController\.getSchedule\)/);
});

test('schedule controller exposes AI generation response metadata', () => {
  const controllerSource = fs.readFileSync(
    path.join(repoRoot, 'controllers', 'scheduleController.js'),
    'utf8'
  );

  assert.match(controllerSource, /const generateAISchedule = async/);
  assert.match(controllerSource, /schedulerService\.generateAISchedule\(userId, pool\)/);
  assert.match(controllerSource, /ai_used: result\.ai_used/);
  assert.match(controllerSource, /fallback_used: result\.fallback_used/);
  assert.match(controllerSource, /count: result\.sessions\.length/);
});
