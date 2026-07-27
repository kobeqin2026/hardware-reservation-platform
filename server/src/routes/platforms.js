const express = require('express');
const router = express.Router();
const { getDB } = require('../models/database');

// 获取所有平台（含当前占用团队）
router.get('/', (req, res) => {
  const db = getDB();
  const currentStage = db.prepare("SELECT value FROM system_config WHERE key='current_stage'").get()?.value || 'BU';

  const platforms = db.prepare('SELECT * FROM platforms ORDER BY LENGTH(label), label').all();

  // 为每个平台获取当前占用团队
  const getActiveTeams = db.prepare(`
    SELECT DISTINCT r.team_id, t.display_name as team_name, t.color as team_color, r.owner, r.purpose
    FROM reservations r
    JOIN teams t ON t.id = r.team_id
    WHERE r.platform_id=? AND r.status='active'
  `);
  const getAllocTeams = db.prepare(`
    SELECT sa.team_id, t.display_name as team_name, t.color as team_color, sa.slot_mode, sa.priority
    FROM stage_allocations sa
    JOIN teams t ON t.id = sa.team_id
    WHERE sa.stage_id=? AND sa.platforms LIKE ?
  `);

  const result = platforms.map(p => {
    const activeTeams = getActiveTeams.all(p.id);

    // 查找当前阶段哪些团队分配了此平台
    const allocTeams = getAllocTeams.all(currentStage, `%${p.id}%`);

    return {
      ...p,
      activeTeams,
      allocatedTeams: allocTeams,
      config: safeJSON(p.config_json)
    };
  });

  res.json({ platforms: result, currentStage });
});

// 获取单个平台详情
router.get('/:id', (req, res) => {
  const db = getDB();
  const platform = db.prepare('SELECT * FROM platforms WHERE id=?').get(req.params.id);
  if (!platform) return res.status(404).json({ error: 'Platform not found' });

  const logs = db.prepare('SELECT * FROM platform_logs WHERE platform_id=? ORDER BY created_at DESC LIMIT 20').all(platform.id);
  const reservations = db.prepare(`
    SELECT r.*, t.display_name as team_name
    FROM reservations r
    JOIN teams t ON t.id = r.team_id
    WHERE r.platform_id=? ORDER BY r.created_at DESC LIMIT 20
  `).all(platform.id);
  const chips = db.prepare('SELECT * FROM chips WHERE platform_id=? ORDER BY slot').all(platform.id);

  res.json({ ...platform, config: safeJSON(platform.config_json), logs, reservations, chips });
});

// 更新平台状态
router.patch('/:id/status', (req, res) => {
  const { status, detail } = req.body;
  if (!status) return res.status(400).json({ error: 'status required' });

  const db = getDB();
  const platform = db.prepare('SELECT * FROM platforms WHERE id=?').get(req.params.id);
  if (!platform) return res.status(404).json({ error: 'Platform not found' });

  db.prepare("UPDATE platforms SET status=?, updated_at=datetime('now','localtime') WHERE id=?").run(status, req.params.id);
  db.prepare("INSERT INTO platform_logs (platform_id, action, detail) VALUES (?,'maintenance',?)").run(req.params.id, detail || `Status changed to ${status}`);

  // 如果改为空闲或维护，释放该平台所有活跃预约
  if (status === 'idle' || status === 'maintenance') {
    const activeRes = db.prepare("SELECT id FROM reservations WHERE platform_id=? AND status='active'").all(req.params.id);
    for (const r of activeRes) {
      db.prepare("UPDATE reservations SET status='cancelled', updated_at=datetime('now','localtime') WHERE id=?").run(r.id);
    }
  }

  res.json({ success: true });
});

// 创建新平台
router.post('/', (req, res) => {
  const { id, label, project, config, location } = req.body;
  if (!id || !label) return res.status(400).json({ error: 'id and label required' });

  const db = getDB();
  const existing = db.prepare('SELECT id FROM platforms WHERE id=?').get(id);
  if (existing) return res.status(409).json({ error: 'Platform already exists' });

  db.prepare("INSERT INTO platforms (id, label, project, location, config_json, status) VALUES (?, ?, ?, ?, ?, 'idle')")
    .run(id, label, project || 'BR2x6', location || '', JSON.stringify(config || {}));
  res.json({ success: true, id });
});

// 更新平台配置
router.patch('/:id/config', (req, res) => {
  const { config } = req.body;
  if (!config) return res.status(400).json({ error: 'config required' });

  const db = getDB();
  db.prepare("UPDATE platforms SET config_json=?, updated_at=datetime('now','localtime') WHERE id=?").run(JSON.stringify(config), req.params.id);
  res.json({ success: true });
});

// 删除平台（管理员）
router.delete('/:id', (req, res) => {
  const db = getDB();
  const platform = db.prepare('SELECT * FROM platforms WHERE id=?').get(req.params.id);
  if (!platform) return res.status(404).json({ error: 'Platform not found' });

  db.prepare("DELETE FROM reservations WHERE platform_id=?").run(req.params.id);
  db.prepare("DELETE FROM chips WHERE platform_id=?").run(req.params.id);
  db.prepare("DELETE FROM platform_logs WHERE platform_id=?").run(req.params.id);
  db.prepare("DELETE FROM platforms WHERE id=?").run(req.params.id);

  res.json({ success: true });
});

// 更新平台所分配的团队（管理员，用于当前stage）
router.put('/:id/allocate-teams', (req, res) => {
  const { teamIds, stageId } = req.body;
  if (!Array.isArray(teamIds)) return res.status(400).json({ error: 'teamIds array required' });

  const db = getDB();
  const platform = db.prepare('SELECT * FROM platforms WHERE id=?').get(req.params.id);
  if (!platform) return res.status(404).json({ error: 'Platform not found' });

  const stage = stageId || db.prepare("SELECT value FROM system_config WHERE key='current_stage'").get()?.value || 'BU';

  // 对于每个选中的团队，在该stage下为该平台做分配（追加或创建）
  const upsert = db.prepare(`
    INSERT INTO stage_allocations (stage_id, team_id, platforms, slot_mode, priority)
    VALUES (?, ?, ?, 'shared', 1)
    ON CONFLICT(stage_id, team_id) DO UPDATE SET
      platforms = CASE
        WHEN instr(',' || platforms || ',', ',' || ? || ',') > 0 THEN platforms
        ELSE platforms || ',' || ?
      END,
      slot_mode = 'shared'
  `);

  // 先移除该平台在stage分配中所有团队的记录中（从platforms字段中移除）
  const oldAllocs = db.prepare('SELECT * FROM stage_allocations WHERE stage_id=?').all(stage);
  for (const alloc of oldAllocs) {
    const platList = (alloc.platforms || '').split(',').filter(Boolean);
    const idx = platList.indexOf(req.params.id);
    if (idx >= 0) {
      platList.splice(idx, 1);
      const newPlats = platList.join(',');
      if (newPlats) {
        db.prepare('UPDATE stage_allocations SET platforms=? WHERE id=?').run(newPlats, alloc.id);
      } else {
        db.prepare('DELETE FROM stage_allocations WHERE id=?').run(alloc.id);
      }
    }
  }

  // 为每个选中的团队添加该平台
  for (const tid of teamIds) {
    const existing = db.prepare('SELECT * FROM stage_allocations WHERE stage_id=? AND team_id=?').get(stage, tid);
    if (existing) {
      const plats = (existing.platforms || '').split(',').filter(Boolean);
      if (!plats.includes(req.params.id)) {
        plats.push(req.params.id);
        db.prepare('UPDATE stage_allocations SET platforms=? WHERE id=?').run(plats.join(','), existing.id);
      }
    } else {
      upsert.run(stage, tid, req.params.id, req.params.id);
    }
  }

  res.json({ success: true, message: `Platform ${req.params.id} team allocation updated` });
});

function safeJSON(str) {
  try { return JSON.parse(str); } catch(e) { return {}; }
}

module.exports = router;