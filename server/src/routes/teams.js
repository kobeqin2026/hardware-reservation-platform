const express = require('express');
const router = express.Router();
const { getDB } = require('../models/database');

// 获取所有团队
router.get('/', (req, res) => {
  const db = getDB();
  const teams = db.prepare('SELECT * FROM teams ORDER BY display_name').all();
  res.json(teams);
});

// 获取某个团队的分配详情（当前阶段）
router.get('/:id/allocations', (req, res) => {
  const db = getDB();
  const team = db.prepare('SELECT * FROM teams WHERE id=?').get(req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const currentStage = db.prepare("SELECT value FROM system_config WHERE key='current_stage'").get()?.value || 'BU';
  const alloc = db.prepare('SELECT * FROM stage_allocations WHERE stage_id=? AND team_id=?').get(currentStage, team.id);

  // 获取该团队的活跃预约
  const activeReservations = db.prepare(`
    SELECT r.*, p.label as platform_label
    FROM reservations r
    JOIN platforms p ON p.id = r.platform_id
    WHERE r.team_id=? AND r.status='active'
  `).all(team.id);

  res.json({
    team,
    currentStage,
    allocation: alloc || { platforms: '' },
    activeReservations
  });
});

// 获取所有团队在当前阶段的分配概览
router.get('/stage-overview', (req, res) => {
  const db = getDB();
  const currentStage = db.prepare("SELECT value FROM system_config WHERE key='current_stage'").get()?.value || 'BU';

  const rows = db.prepare(`
    SELECT sa.*, t.display_name as team_name, t.color as team_color, t.owners
    FROM stage_allocations sa
    JOIN teams t ON t.id = sa.team_id
    WHERE sa.stage_id=?
    ORDER BY sa.priority, t.display_name
  `).all(currentStage);

  res.json({ stageId: currentStage, allocations: rows });
});

module.exports = router;