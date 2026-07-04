-- Store one scheduling and reminder preferences row per user.
CREATE TABLE IF NOT EXISTS user_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  preferred_study_start_time TIME NOT NULL DEFAULT '09:00',
  preferred_study_end_time TIME NOT NULL DEFAULT '22:00',
  max_session_minutes INTEGER NOT NULL DEFAULT 120,
  break_minutes INTEGER NOT NULL DEFAULT 15,
  avoid_weekends BOOLEAN NOT NULL DEFAULT false,
  deadline_buffer_days INTEGER NOT NULL DEFAULT 1,
  enable_due_soon_reminders BOOLEAN NOT NULL DEFAULT true,
  enable_overdue_reminders BOOLEAN NOT NULL DEFAULT true,
  enable_study_session_reminders BOOLEAN NOT NULL DEFAULT true,
  reminder_lead_hours INTEGER NOT NULL DEFAULT 24,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (preferred_study_start_time < preferred_study_end_time),
  CHECK (max_session_minutes > 0),
  CHECK (break_minutes >= 0),
  CHECK (deadline_buffer_days >= 0),
  CHECK (reminder_lead_hours >= 0)
);

INSERT INTO user_settings (user_id)
SELECT id
FROM users
ON CONFLICT (user_id) DO NOTHING;
