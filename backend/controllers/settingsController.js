const pool = require('../config/db');

const SETTINGS_COLUMNS = `
  id,
  user_id,
  preferred_study_start_time,
  preferred_study_end_time,
  max_session_minutes,
  break_minutes,
  avoid_weekends,
  deadline_buffer_days,
  enable_due_soon_reminders,
  enable_overdue_reminders,
  enable_study_session_reminders,
  reminder_lead_hours,
  created_at,
  updated_at
`;

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const INTEGER_RULES = {
  max_session_minutes: {
    min: 30,
    max: 240,
    message: 'Max session minutes must be between 30 and 240',
  },
  break_minutes: {
    min: 0,
    max: 60,
    message: 'Break minutes must be between 0 and 60',
  },
  deadline_buffer_days: {
    min: 0,
    max: 14,
    message: 'Deadline buffer days must be between 0 and 14',
  },
  reminder_lead_hours: {
    min: 1,
    max: 168,
    message: 'Reminder lead hours must be between 1 and 168',
  },
};
const BOOLEAN_FIELDS = [
  'avoid_weekends',
  'enable_due_soon_reminders',
  'enable_overdue_reminders',
  'enable_study_session_reminders',
];
const UPDATABLE_FIELDS = [
  'preferred_study_start_time',
  'preferred_study_end_time',
  ...Object.keys(INTEGER_RULES),
  ...BOOLEAN_FIELDS,
];

const timeToSeconds = (value) => {
  const [hours, minutes, seconds = '0'] = String(value).split(':');
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
};

const normalizeTime = (value) => {
  if (typeof value !== 'string' || !TIME_REGEX.test(value)) return null;
  const [hours, minutes, seconds = '00'] = value.split(':');
  return `${hours}:${minutes}:${seconds}`;
};

const getOrCreateSettings = async (userId) => {
  const result = await pool.query(
    `INSERT INTO user_settings (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE
       SET user_id = EXCLUDED.user_id
     RETURNING ${SETTINGS_COLUMNS}`,
    [userId]
  );

  return result.rows[0];
};

const validateSettingsUpdate = (body, currentSettings) => {
  const updates = {};

  for (const field of UPDATABLE_FIELDS) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (!Object.keys(updates).length) {
    return { error: 'No settings fields to update' };
  }

  for (const field of ['preferred_study_start_time', 'preferred_study_end_time']) {
    if (updates[field] !== undefined) {
      const normalized = normalizeTime(updates[field]);
      if (!normalized) {
        return {
          error: `${field} must be a valid time in HH:MM or HH:MM:SS format`,
        };
      }
      updates[field] = normalized;
    }
  }

  for (const [field, rule] of Object.entries(INTEGER_RULES)) {
    if (updates[field] !== undefined) {
      const value = updates[field];
      if (
        !Number.isInteger(value) ||
        value < rule.min ||
        value > rule.max
      ) {
        return { error: rule.message };
      }
    }
  }

  for (const field of BOOLEAN_FIELDS) {
    if (updates[field] !== undefined && typeof updates[field] !== 'boolean') {
      return { error: `${field} must be a boolean` };
    }
  }

  const startTime =
    updates.preferred_study_start_time ||
    normalizeTime(currentSettings.preferred_study_start_time);
  const endTime =
    updates.preferred_study_end_time ||
    normalizeTime(currentSettings.preferred_study_end_time);

  if (timeToSeconds(endTime) <= timeToSeconds(startTime)) {
    return {
      error: 'Preferred study end time must be after preferred study start time',
    };
  }

  return { updates };
};

const getSettings = async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user.id);
    return res.json({ settings });
  } catch (err) {
    console.error('Get settings error:', err);
    return res.status(500).json({ error: 'Failed to retrieve settings' });
  }
};

const updateSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    const currentSettings = await getOrCreateSettings(userId);
    const { error, updates } = validateSettingsUpdate(req.body || {}, currentSettings);

    if (error) return res.status(400).json({ error });

    const setClauses = [];
    const params = [];

    for (const [field, value] of Object.entries(updates)) {
      params.push(value);
      setClauses.push(`${field} = $${params.length}`);
    }

    setClauses.push('updated_at = CURRENT_TIMESTAMP');
    params.push(userId);

    const result = await pool.query(
      `UPDATE user_settings
       SET ${setClauses.join(', ')}
       WHERE user_id = $${params.length}
       RETURNING ${SETTINGS_COLUMNS}`,
      params
    );

    return res.json({
      message: 'Settings updated successfully',
      settings: result.rows[0],
    });
  } catch (err) {
    console.error('Update settings error:', err);
    return res.status(500).json({ error: 'Failed to update settings' });
  }
};

module.exports = {
  getSettings,
  updateSettings,
};
