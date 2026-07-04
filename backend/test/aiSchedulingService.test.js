const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AISchedulingError,
  getAISchedulingPlan,
  parseProviderResponse,
} = require('../services/aiSchedulingService');

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

const resetAIEnvironment = () => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
};

test('parses JSON scheduling plans from provider message content', () => {
  const parsed = parseProviderResponse({
    choices: [
      {
        message: {
          content: JSON.stringify({
            task_plans: [
              {
                task_id: 12,
                recommended_total_minutes: 240,
                recommended_session_count: 3,
                recommended_session_minutes: 80,
                recommended_strategy: 'split across multiple days before deadline',
                reason: 'High priority assignment due soon',
              },
            ],
          }),
        },
      },
    ],
  });

  assert.equal(parsed.task_plans[0].task_id, 12);
});

test('fails safely when AI scheduling is disabled', async () => {
  resetAIEnvironment();
  process.env.AI_SCHEDULING_ENABLED = 'false';

  await assert.rejects(
    () => getAISchedulingPlan({ tasks: [], lessons: [], settings: null, existingSessions: [] }),
    (err) => err instanceof AISchedulingError && err.code === 'AI_DISABLED'
  );

  resetAIEnvironment();
});

test('returns a validated plan from a configured provider response', async () => {
  resetAIEnvironment();
  process.env.AI_SCHEDULING_ENABLED = 'true';
  process.env.AI_PROVIDER_URL = 'https://provider.example/schedule';
  process.env.AI_PROVIDER_API_KEY = 'test-key';
  process.env.AI_MODEL = 'test-model';

  globalThis.fetch = async (url, options) => {
    const requestBody = JSON.parse(options.body);

    assert.equal(url, 'https://provider.example/schedule');
    assert.equal(requestBody.model, 'test-model');
    assert.equal(requestBody.response_format.type, 'json_object');

    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                task_plans: [
                  {
                    task_id: 7,
                    recommended_total_minutes: 120,
                    recommended_session_count: 2,
                    recommended_session_minutes: 60,
                    recommended_strategy: 'two focused sessions before the deadline',
                    reason: 'Medium difficulty assignment with enough time to split work',
                  },
                ],
              }),
            },
          },
        ],
      }),
    };
  };

  const plan = await getAISchedulingPlan({
    tasks: [
      {
        id: 7,
        title: 'Essay draft',
        priority: 3,
        task_type: 'assignment',
        difficulty: 'medium',
      },
    ],
    lessons: [],
    settings: null,
    existingSessions: [],
  });

  assert.deepEqual(plan, {
    task_plans: [
      {
        task_id: 7,
        recommended_total_minutes: 120,
        recommended_session_count: 2,
        recommended_session_minutes: 60,
        recommended_strategy: 'two focused sessions before the deadline',
        reason: 'Medium difficulty assignment with enough time to split work',
      },
    ],
  });

  resetAIEnvironment();
});
