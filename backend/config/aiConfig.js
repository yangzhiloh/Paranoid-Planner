const DEFAULT_MAX_TOKENS = 1200;
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

const parseBoolean = (value) => String(value || '').toLowerCase() === 'true';

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const getAISchedulingConfig = () => {
  const enabled = parseBoolean(process.env.AI_SCHEDULING_ENABLED);
  const apiKey = (process.env.AI_PROVIDER_API_KEY || '').trim();

  return {
    enabled,
    providerName: (process.env.AI_PROVIDER_NAME || 'generic').trim(),
    providerUrl: (process.env.AI_PROVIDER_URL || '').trim(),
    apiKey,
    model: (process.env.AI_MODEL || '').trim(),
    maxTokens: parsePositiveInteger(
      process.env.AI_MAX_TOKENS,
      DEFAULT_MAX_TOKENS
    ),
    requestTimeoutMs: parsePositiveInteger(
      process.env.AI_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS
    ),
  };
};

const isAISchedulingConfigured = () => {
  const config = getAISchedulingConfig();
  return config.enabled && Boolean(config.apiKey && config.model && config.providerUrl);
};

module.exports = {
  DEFAULT_MAX_TOKENS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  getAISchedulingConfig,
  isAISchedulingConfigured,
};
