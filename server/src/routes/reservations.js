const express = require('express');
const router = express.Router();
const { getDB } = require('../models/database');

// 获取当前阶段的分配概览 (作为主看板数据)
router.get('/overview', (req, res) => {
  res.set('Cache-Control', 'no-store');
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
  res.set('Cache-Control', 'no-store');
  const { teamId, platformId, purpose, owner, stageId, isAdmin, isOwner } = req.body;
  if (!teamId || !platformId) return res.status(400).json({ error: 'teamId and platformId required' });

  const db = getDB();
  const team = db.prepare('SELECT * FROM teams WHERE id=?').get(teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  const platform = db.prepare('SELECT * FROM platforms WHERE id=?').get(platformId);
  if (!platform) return res.status(404).json({ error: 'Platform not found' });

  const currentStage = stageId || db.prepare("SELECT value FROM system_config WHERE key='current_stage'").get()?.value || 'BU';

  // 2026-09-28: 必须有团队信息才能预约 —— 平台在当前阶段至少预分配给一个团队(day_allocations 有记录)，
  // 否则拒绝。目的是防止产生"使用中但无团队信息"的脏状态(如此前 BU5 残留 in_use 却没有任何活跃预约)。
  // domain owner 暂时豁免(用户明确要求"domain owner 暂时不需要受预分配限制", 2026-09-28)：
  // admin 仍需团队信息，owner 跳过平台级与团队级两张预分配校验。
  // 2026-10-01: 空闲(idle)平台随时可预约 —— 空闲=无活跃预约(真正空闲), 预约本身即建立团队信息,
  // 不会产生"使用中但无团队信息"脏状态; 非空闲平台仍须预分配。
  // 2026-10-02: 共享平台也可预约 —— 平台已有活跃预约(active reservations, 正被其他团队共享使用)
  // 即视为"有团队信息", 无需 day_allocations(预分配已清空)。业务规则: 一台 BU 允许 2~3 团队共享,
  // 被占用不是不可预约的理由。仍保留对"in_use 但既无活跃预约也无预分配"脏状态的拦截。
  if (!isOwner) {
    const platAlloc = db.prepare('SELECT COUNT(*) AS c FROM day_allocations WHERE platform_id=? AND stage_id=?').get(platformId, currentStage);
    const isFreeIdle = platform.status === 'idle';
    const hasActiveRes = db.prepare("SELECT COUNT(*) AS c FROM reservations WHERE platform_id=? AND status='active'").get(platformId).c > 0;
    if ((!platAlloc || platAlloc.c === 0) && !isFreeIdle && !hasActiveRes) {
      return res.status(400).json({ error: '该平台没有团队信息，无法预约。请先在团队分配中为该平台预分配团队后再预约' });
    }
  }

  // 非 admin：只能预约自己的团队已预分配的平台(owner 已被豁免, 此分支仅兜底); 空闲平台同样放行(2026-10-01)
  if (!isAdmin && !isOwner) {
    const alloc = db.prepare('SELECT COUNT(*) as c FROM day_allocations WHERE platform_id=? AND team_id=? AND stage_id=?').get(platformId, teamId, currentStage);
    if ((!alloc || alloc.c === 0) && platform.status !== 'idle') {
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
  const { reservationId, isAdmin, teamId } = req.body;
  if (!reservationId) return res.status(400).json({ error: 'reservationId required' });

  const db = getDB();
  const reservation = db.prepare('SELECT * FROM reservations WHERE id=?').get(reservationId);
  if (!reservation) return res.status(404).json({ error: 'Reservation not found' });

  // 非 admin(owner)：只能释放本团队(team_id)的预约，防止跨团队释放
  if (!isAdmin && (teamId || '') !== reservation.team_id) {
    return res.status(403).json({ error: '只能释放本团队的平台预约' });
  }

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

// 获取预约平台历史记录 (含已完成): 平台/团队/负责人/用途/新建预约时间/释放预约时间/状态
router.get('/history', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const db = getDB();
  const project = req.query.project || (process.env.DEFAULT_PROJECT || 'default-project');
  const rows = db.prepare(`
    SELECT r.id, r.platform_id, p.label as platform_label, r.team_id,
           t.display_name as team_name, r.owner, r.purpose, r.status,
           r.started_at, r.ended_at
    FROM reservations r
    JOIN platforms p ON p.id = r.platform_id
    JOIN teams t ON t.id = r.team_id
    WHERE p.project = ?
    ORDER BY r.started_at DESC, r.id DESC
  `).all(project);
  res.json({ success: true, items: rows });
});

// 获取活跃预约摘要（按项目，用于 Gantt 图）
router.get('/active-summary', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const db = getDB();
  const project = req.query.project || (process.env.DEFAULT_PROJECT || 'default-project');
  const rows = db.prepare(`
    SELECT r.platform_id, p.label as platform_label, r.team_id,
           t.display_name as team_name, t.color as team_color,
           r.owner, r.purpose, r.started_at,
           COALESCE(r.ended_at, datetime('now','localtime')) as ended_at
    FROM reservations r
    JOIN platforms p ON p.id = r.platform_id
    JOIN teams t ON t.id = r.team_id
    WHERE r.status='active' AND p.project=?
    ORDER BY p.id, r.started_at
  `).all(project);
  res.json(rows);
});

module.exports = router;