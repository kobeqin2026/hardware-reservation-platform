const express = require('express');
const router = express.Router();
const { getDB } = require('../models/database');

// 获取当前阶段的分配概览 (作为主看板数据)
router.get('/overview', (req, res) => {
  const db = getDB();
  const currentStage = db.prepare("SELECT value FROM system_config WHERE key='current_stage'").get()?.value || 'BU';

  const stages = db.prepare('SELECT * FROM stages ORDER BY sort_order').all();
  const platforms = db.prepare('SELECT * FROM platforms ORDER BY id').all();
  const teams = db.prepare('SELECT * FROM teams ORDER BY display_name').all();
  const allocations = db.prepare(`
    SELECT sa.*, t.display_name as team_name, t.color as team_color, t.owners
    FROM stage_allocations sa
    JOIN teams t ON t.id = sa.team_id
    WHERE sa.stage_id=?
    ORDER BY sa.priority, t.display_name
  `).all(currentStage);
  const activeReservations = db.prepare(`
    SELECT r.*, t.display_name as team_name, p.label as platform_label
    FROM reservations r
    JOIN teams t ON t.id = r.team_id
    JOIN platforms p ON p.id = r.platform_id
    WHERE r.status='active'
  `).all();

  res.json({
    currentStage,
    stages,
    platforms,
    teams,
    allocations,
    activeReservations
  });
});

// 创建预约 (团队使用平台)
router.post('/reserve', (req, res) => {
  const { teamId, platformId, purpose, owner, stageId, isAdmin } = req.body;
  if (!teamId || !platformId) return res.status(400).json({ error: 'teamId and platformId required' });

  const db = getDB();
  const team = db.prepare('SELECT * FROM teams WHERE id=?').get(teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  const platform = db.prepare('SELECT * FROM platforms WHERE id=?').get(platformId);
  if (!platform) return res.status(404).json({ error: 'Platform not found' });

  const currentStage = stageId || db.prepare("SELECT value FROM system_config WHERE key='current_stage'").get()?.value || 'BU';

  // 非 admin：只能预约自己的团队已预分配的平台
  if (!isAdmin) {
    const alloc = db.prepare('SELECT COUNT(*) as c FROM day_allocations WHERE platform_id=? AND team_id=? AND stage_id=?').get(platformId, teamId, currentStage);
    if (!alloc || alloc.c === 0) {
      return res.status(403).json({ error: '该平台未预分配给您的团队，请联系管理员预约' });
    }
  }

  db.prepare(`
    INSERT INTO reservations (team_id, platform_id, stage_id, purpose, owner, status)
    VALUES (?,?,?,?,?,'active')
  `).run(teamId, platformId, currentStage, purpose || '', owner || team.owners.split(',')[0]);

  // 更新平台状态
  db.prepare("UPDATE platforms SET status='in_use', updated_at=datetime('now','localtime') WHERE id=?").run(platformId);
  db.prepare("INSERT INTO platform_logs (platform_id, action, team_id, detail) VALUES (?,'reserve',?,?)").run(platformId, teamId, purpose || 'Reserved');

  res.json({ success: true, message: `${team.display_name} reserved ${platformId}` });
});

// 释放平台
router.post('/release', (req, res) => {
  const { reservationId } = req.body;
  if (!reservationId) return res.status(400).json({ error: 'reservationId required' });

  const db = getDB();
  const reservation = db.prepare('SELECT * FROM reservations WHERE id=?').get(reservationId);
  if (!reservation) return res.status(404).json({ error: 'Reservation not found' });

  db.prepare("UPDATE reservations SET status='completed', ended_at=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE id=?").run(reservationId);

  // 检查该平台是否还有其他活跃预约
  const otherActive = db.prepare('SELECT COUNT(*) as c FROM reservations WHERE platform_id=? AND status=\'active\'').get(reservation.platform_id);
  if (otherActive.c === 0) {
    db.prepare("UPDATE platforms SET status='idle', updated_at=datetime('now','localtime') WHERE id=?").run(reservation.platform_id);
  }

  db.prepare("INSERT INTO platform_logs (platform_id, action, team_id, detail) VALUES (?,'release',?,'Released')").run(reservation.platform_id, reservation.team_id);

  res.json({ success: true });
});

// 获取日志
router.get('/logs', (req, res) => {
  const db = getDB();
  const { platformId, limit = 50 } = req.query;
  let logs;
  if (platformId) {
    logs = db.prepare('SELECT pl.*, t.display_name as team_name FROM platform_logs pl LEFT JOIN teams t ON t.id=pl.team_id WHERE pl.platform_id=? ORDER BY pl.created_at DESC LIMIT ?').all(platformId, parseInt(limit));
  } else {
    logs = db.prepare('SELECT pl.*, t.display_name as team_name FROM platform_logs pl LEFT JOIN teams t ON t.id=pl.team_id ORDER BY pl.created_at DESC LIMIT ?').all(parseInt(limit));
  }
  res.json(logs);
});

module.exports = router;