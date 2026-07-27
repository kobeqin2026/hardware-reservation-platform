const express = require('express');
const router = express.Router();
const { getDB } = require('../models/database');

// 获取所有阶段
router.get('/', (req, res) => {
  const db = getDB();
  const stages = db.prepare('SELECT * FROM stages ORDER BY sort_order').all();
  const current = db.prepare("SELECT value FROM system_config WHERE key='current_stage'").get();
  res.json({ stages, currentStage: current?.value || 'BU' });
});

// 更新阶段信息（时间范围等）
router.put('/:id', (req, res) => {
  const { start_week, end_week, duration_weeks, name, color } = req.body;
  const db = getDB();
  const stage = db.prepare('SELECT * FROM stages WHERE id=?').get(req.params.id);
  if (!stage) return res.status(404).json({ error: 'Stage not found' });

  db.prepare(`
    UPDATE stages SET
      start_week=?,
      end_week=?,
      duration_weeks=?,
      name=?,
      color=?
    WHERE id=?
  `).run(
    start_week ?? stage.start_week,
    end_week ?? stage.end_week,
    duration_weeks ?? stage.duration_weeks,
    name ?? stage.name,
    color ?? stage.color,
    req.params.id
  );

  res.json({ success: true });
});

// 切换当前阶段
router.post('/switch', (req, res) => {
  const { stageId } = req.body;
  if (!stageId) return res.status(400).json({ error: 'stageId required' });

  const db = getDB();
  const stage = db.prepare('SELECT * FROM stages WHERE id=?').get(stageId);
  if (!stage) return res.status(404).json({ error: 'Stage not found' });

  db.prepare("UPDATE system_config SET value=? WHERE key='current_stage'").run(stageId);

  // 记录日志：每个平台标记阶段切换
  const platforms = db.prepare('SELECT id FROM platforms').all();
  const logInsert = db.prepare("INSERT INTO platform_logs (platform_id, action, detail) VALUES (?,'stage_switch',?)");
  for (const p of platforms) {
    logInsert.run(p.id, `Phase switched to ${stageId}`);
  }

  res.json({ success: true, currentStage: stageId });
});

module.exports = router;