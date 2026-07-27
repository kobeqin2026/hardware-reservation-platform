const express = require('express');
const router = express.Router();
const { getDB } = require('../models/database');

// 获取dashboard统计数据（按项目过滤）
router.get('/stats', (req, res) => {
  const db = getDB();
  const currentStage = db.prepare("SELECT value FROM system_config WHERE key='current_stage'").get()?.value || 'BU';
  const project = req.query.project || ''; // 默认不过滤，但前端会传

  let projectFilter = '';
  const params = [];
  if (project) {
    projectFilter = ' WHERE project=?';
    params.push(project);
  }

  const totalPlatforms = db.prepare(`SELECT COUNT(*) as c FROM platforms${projectFilter}`).get(...params).c;
  const inUse = db.prepare(`SELECT COUNT(*) as c FROM platforms WHERE status='in_use'${projectFilter ? ' AND project=?' : ''}`).get(...(project ? [project] : [])).c;
  const idle = db.prepare(`SELECT COUNT(*) as c FROM platforms WHERE status='idle'${projectFilter ? ' AND project=?' : ''}`).get(...(project ? [project] : [])).c;
  const maintenance = db.prepare(`SELECT COUNT(*) as c FROM platforms WHERE status='maintenance'${projectFilter ? ' AND project=?' : ''}`).get(...(project ? [project] : [])).c;
  const backup = db.prepare(`SELECT COUNT(*) as c FROM platforms WHERE (status='backup' OR status='ft_reserved')${projectFilter ? ' AND project=?' : ''}`).get(...(project ? [project] : [])).c;

  const activeTeams = db.prepare('SELECT COUNT(DISTINCT team_id) as c FROM reservations WHERE status=\'active\'').get().c;
  const activeReservations = db.prepare("SELECT COUNT(*) as c FROM reservations WHERE status='active'").get().c;
  const totalTeams = db.prepare('SELECT COUNT(*) as c FROM teams').get().c;
  const totalAllocs = db.prepare('SELECT COUNT(*) as c FROM stage_allocations WHERE stage_id=? AND platforms!=\'\'').get(currentStage).c;

  res.json({
    currentStage,
    totalPlatforms,
    inUse,
    idle,
    maintenance,
    backup,
    activeTeams,
    activeReservations,
    totalTeams,
    activeAllocTeams: totalAllocs
  });
});

// 获取阶段分配对比（所有阶段的团队配额对比）
router.get('/stage-comparison', (req, res) => {
  const db = getDB();
  const stages = db.prepare('SELECT * FROM stages ORDER BY sort_order').all();
  const teams = db.prepare('SELECT id, display_name, color FROM teams').all();

  const result = stages.map(stage => {
    const allocations = db.prepare(`
      SELECT sa.*, t.display_name, t.color
      FROM stage_allocations sa
      JOIN teams t ON t.id=sa.team_id
      WHERE sa.stage_id=?
      ORDER BY sa.priority, t.display_name
    `).all(stage.id);

    return { ...stage, allocations };
  });

  res.json({ stages: result, teams });
});

module.exports = router;