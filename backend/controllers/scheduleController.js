const pool = require('../config/db');
const schedulerService = require('../services/schedulerService');

const generateSchedule = async (req, res) => {
  try {
    const userId = req.user.id;
   
    const result = await schedulerService.generateSchedule(userId, pool);

    res.json({
      message: result.message,
      sessions: result.sessions,
    });
  } catch (err) {
    console.error('Generate schedule error:', err);
    res.status(500).json({ error: 'Failed to generate schedule' });
  }
};

const generateAISchedule = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await schedulerService.generateAISchedule(userId, pool);

    res.json({
      message: result.message,
      sessions: result.sessions,
      ai_used: result.ai_used,
      fallback_used: result.fallback_used,
      count: result.sessions.length,
    });
  } catch (err) {
    console.error('Generate AI schedule error:', {
      code: err.code,
      message: err.message,
    });
    res.status(500).json({ error: 'Failed to generate AI-assisted schedule' });
  }
};

const getSchedule = async (req, res) => {
  try {
    const userId = req.user.id;

    const { sessions, lessons } = await schedulerService.getSchedule(userId, pool);

    res.json({
      sessions,
      lessons,
      count: sessions.length,
    });
  } catch (err) {
    console.error('Get schedule error:', err);
    res.status(500).json({ error: 'Failed to retrieve schedule' });
  }
};

module.exports = {
  generateAISchedule,
  generateSchedule,
  getSchedule,
};
