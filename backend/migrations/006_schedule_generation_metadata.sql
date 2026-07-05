-- Track how generated study sessions were created.
ALTER TABLE study_sessions
  ADD COLUMN IF NOT EXISTS generation_method VARCHAR(50) DEFAULT 'rule_based',
  ADD COLUMN IF NOT EXISTS generation_reason TEXT,
  ADD COLUMN IF NOT EXISTS ai_strategy TEXT,
  ADD COLUMN IF NOT EXISTS generation_id VARCHAR(100);

UPDATE study_sessions
SET generation_method = COALESCE(generation_method, 'rule_based');
