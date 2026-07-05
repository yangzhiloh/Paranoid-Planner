const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MIN_SESSION_MINUTES,
  validateAISchedulePlan,
} = require('../services/aiScheduleValidator');

const TASKS = [
  { id: 1, title: 'Assignment' },
  { id: 2, title: 'Quiz revision' },
];

test('validateAISchedulePlan safely handles invalid object shapes', () => {
  assert.deepEqual(validateAISchedulePlan(null, TASKS, {}), {
    valid: false,
    taskPlans: [],
    warnings: [
      'AI schedule plan must be an object',
      'No valid AI task plans returned',
    ],
  });

  const missingArray = validateAISchedulePlan({}, TASKS, {});
  assert.equal(missingArray.valid, false);
  assert.match(missingArray.warnings.join(' '), /task_plans array/);
});

test('validateAISchedulePlan rejects unknown task IDs and keeps valid plans', () => {
  const result = validateAISchedulePlan(
    {
      task_plans: [
        {
          task_id: 99,
          recommended_total_minutes: 60,
          recommended_session_count: 1,
          recommended_session_minutes: 60,
          recommended_strategy: 'single focused block',
          reason: 'Looks short',
        },
        {
          task_id: 1,
          recommended_total_minutes: 120,
          recommended_session_count: 2,
          recommended_session_minutes: 60,
          recommended_strategy: 'split into two sessions',
          reason: 'Enough time before deadline',
        },
      ],
    },
    TASKS,
    { max_session_minutes: 120 }
  );

  assert.equal(result.valid, true);
  assert.equal(result.taskPlans.length, 1);
  assert.equal(result.taskPlans[0].task_id, 1);
  assert.match(result.warnings.join(' '), /unknown task_id 99/);
});

test('validateAISchedulePlan rejects unreasonable short sessions and caps long sessions', () => {
  const result = validateAISchedulePlan(
    {
      task_plans: [
        {
          task_id: 1,
          recommended_total_minutes: 30,
          recommended_session_count: 1,
          recommended_session_minutes: MIN_SESSION_MINUTES - 1,
          recommended_strategy: 'too short',
          reason: 'Invalid duration',
        },
        {
          task_id: 2,
          recommended_total_minutes: 300,
          recommended_session_count: 2,
          recommended_session_minutes: 180,
          recommended_strategy: 'long sessions',
          reason: 'AI suggested more than max',
        },
      ],
    },
    TASKS,
    { max_session_minutes: 90 }
  );

  assert.equal(result.valid, true);
  assert.equal(result.taskPlans.length, 1);
  assert.equal(result.taskPlans[0].task_id, 2);
  assert.equal(result.taskPlans[0].recommended_session_minutes, 90);
  assert.match(result.warnings.join(' '), /shorter than 15 minutes/);
  assert.match(result.warnings.join(' '), /capped at 90/);
});

test('validateAISchedulePlan returns fallback signal when no valid plans remain', () => {
  const result = validateAISchedulePlan(
    {
      task_plans: [
        {
          task_id: 1,
          recommended_total_minutes: -30,
          recommended_session_count: 0,
          recommended_session_minutes: 0,
          recommended_strategy: '',
          reason: '',
        },
      ],
    },
    TASKS,
    {}
  );

  assert.equal(result.valid, false);
  assert.deepEqual(result.taskPlans, []);
  assert.match(result.warnings.join(' '), /No valid AI task plans returned/);
});
