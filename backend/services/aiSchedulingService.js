const { getAISchedulingConfig } = require('../config/aiConfig');
const {
  buildAISchedulePrompt,
  buildPromptData,
} = require('./aiSchedulePromptBuilder');
const { validateAISchedulePlan } = require('./aiScheduleValidator');

class AISchedulingError extends Error {
  constructor(message, code, statusCode = 503) {
    super(message);
    this.name = 'AISchedulingError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const safeLogAIError = (message, error) => {
  console.error(message, {
    code: error.code,
    statusCode: error.statusCode,
    message: error.message,
  });
};

const stripCodeFence = (value) =>
  String(value || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

const extractFirstJSONObject = (value) => {
  const text = stripCodeFence(value);
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return text;
  }

  return text.slice(firstBrace, lastBrace + 1);
};

const parseJSONText = (value) => {
  try {
    return JSON.parse(extractFirstJSONObject(value));
  } catch (err) {
    throw new AISchedulingError('AI provider returned invalid JSON', 'AI_INVALID_JSON', 502);
  }
};

const parseProviderResponse = (providerResponse) => {
  if (!providerResponse || typeof providerResponse !== 'object') {
    throw new AISchedulingError('AI provider returned an empty response', 'AI_EMPTY_RESPONSE', 502);
  }

  if (Array.isArray(providerResponse.task_plans)) {
    return providerResponse;
  }

  const choice = providerResponse.choices?.[0];
  const messageContent = choice?.message?.content;

  if (typeof messageContent === 'string') {
    return parseJSONText(messageContent);
  }

  if (Array.isArray(messageContent)) {
    const textContent = messageContent
      .map((part) => part.text || part.content || '')
      .join('');
    return parseJSONText(textContent);
  }

  if (typeof choice?.text === 'string') {
    return parseJSONText(choice.text);
  }

  if (typeof providerResponse.output_text === 'string') {
    return parseJSONText(providerResponse.output_text);
  }

  throw new AISchedulingError('AI provider response did not include JSON content', 'AI_NO_JSON_CONTENT', 502);
};

const validateAIPlan = (plan, tasks = [], settings = {}) => {
  const validation = validateAISchedulePlan(plan, tasks, settings);

  if (!validation.valid) {
    const error = new AISchedulingError(validation.warnings.join('; '), 'AI_INVALID_PLAN', 502);
    error.warnings = validation.warnings;
    throw error;
  }

  return {
    task_plans: validation.taskPlans,
    warnings: validation.warnings,
  };
};

const buildMessages = (prompt) => [
  {
    role: 'system',
    content: [
      'You are helping create an academic study plan.',
      'Return JSON only. Do not include markdown, commentary, or code fences.',
      'Recommend task-level study effort only; do not create calendar sessions.',
      'Do not invent task IDs. Use only task IDs from the supplied tasks.',
    ].join(' '),
  },
  {
    role: 'user',
    content: prompt,
  },
];

const buildProviderRequestBody = (config, prompt) => ({
  model: config.model,
  messages: buildMessages(prompt),
  max_tokens: config.maxTokens,
  response_format: { type: 'json_object' },
});

const assertAIAvailable = (config) => {
  if (!config.enabled) {
    throw new AISchedulingError('AI scheduling is disabled', 'AI_DISABLED');
  }

  if (!config.providerUrl) {
    throw new AISchedulingError('AI provider URL is not configured', 'AI_MISSING_PROVIDER_URL');
  }

  if (!config.apiKey) {
    throw new AISchedulingError('AI provider API key is not configured', 'AI_MISSING_API_KEY');
  }

  if (!config.model) {
    throw new AISchedulingError('AI model is not configured', 'AI_MISSING_MODEL');
  }

  if (typeof globalThis.fetch !== 'function') {
    throw new AISchedulingError('AI requests require a runtime with fetch support', 'AI_FETCH_UNAVAILABLE');
  }
};

const fetchProviderResponse = async (config, prompt) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await globalThis.fetch(config.providerUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildProviderRequestBody(config, prompt)),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AISchedulingError(
        `AI provider request failed with status ${response.status}`,
        'AI_PROVIDER_ERROR',
        502
      );
    }

    return response.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AISchedulingError('AI provider request timed out', 'AI_TIMEOUT', 504);
    }
    if (err instanceof AISchedulingError) {
      throw err;
    }
    throw new AISchedulingError('AI provider request failed', 'AI_REQUEST_FAILED', 502);
  } finally {
    clearTimeout(timeout);
  }
};

const getAISchedulingPlan = async ({ tasks, lessons, settings, existingSessions }) => {
  const config = getAISchedulingConfig();

  try {
    assertAIAvailable(config);

    const prompt = buildAISchedulePrompt({ tasks, lessons, settings, existingSessions });
    const providerResponse = await fetchProviderResponse(config, prompt);
    const parsedPlan = parseProviderResponse(providerResponse);

    return validateAIPlan(parsedPlan, tasks, settings);
  } catch (err) {
    if (err instanceof AISchedulingError) {
      safeLogAIError('AI scheduling unavailable:', err);
      throw err;
    }

    const controlledError = new AISchedulingError('AI scheduling failed', 'AI_UNKNOWN_ERROR', 500);
    safeLogAIError('AI scheduling failed:', controlledError);
    throw controlledError;
  }
};

module.exports = {
  AISchedulingError,
  buildMessages,
  buildProviderRequestBody,
  buildPromptData,
  getAISchedulingPlan,
  parseProviderResponse,
  validateAIPlan,
};
