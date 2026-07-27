const express = require('express');
const router = express.Router();
const { getDB } = require('../models/database');

// 获取所有项目
router.get('/', (req, res) => {
  const db = getDB();
  const rows = db.prepare('SELECT name FROM projects ORDER BY name').all();
  res.json({ projects: rows.map(r => r.name) });
});

// 创建新项目
router.post('/', (req, res) => {
  const { project } = req.body;
  if (!project || !project.trim()) return res.status(400).json({ error: 'project name required' });
  const db = getDB();
  // 检查是否已存在
  const existing = db.prepare('SELECT name FROM projects WHERE name=?').get(project.trim());
  if (existing) return res.status(409).json({ error: '项目已存在' });
  db.prepare('INSERT INTO projects (name) VALUES (?)').run(project.trim());
  res.json({ success: true, project: project.trim() });
});

// 从已有项目复制平台到新项目
router.post('/copy', (req, res) => {
  const { fromProject, toProject } = req.body;
  if (!fromProject || !toProject) return res.status(400).json({ error: 'fromProject and toProject required' });

  const db = getDB();

  // 检查源项目是否存在
  const sourcePlats = db.prepare('SELECT * FROM platforms WHERE project=?').all(fromProject);
  if (!sourcePlats.length) return res.status(404).json({ error: `源项目 ${fromProject} 没有平台数据` });

  // 检查目标项目是否已有平台
  const existingTarget = db.prepare('SELECT COUNT(*) as c FROM platforms WHERE project=?').get(toProject);
  if (existingTarget.c > 0) return res.status(409).json({ error: `目标项目 ${toProject} 已存在平台数据，请先清空` });

  // 复制每个平台
  const insert = db.prepare('INSERT INTO platforms (id, label, project, status, location, config_json) VALUES (?, ?, ?, ?, ?, ?)');
  const idMap = {}; // oldId -> newId
  let count = 0;
  for (const p of sourcePlats) {
    const dup = db.prepare('SELECT id FROM platforms WHERE project=? AND label=?').get(toProject, p.label);
    if (dup) continue;
    // 使用 label 作为新ID（例如 BR200-Socket1），保证唯一性
    const newId = `${toProject}-${p.label}`;
    idMap[p.id] = newId;
    insert.run(newId, p.label, toProject, 'idle', p.location || '', p.config_json || '{}');
    count++;
  }

  // 复制当前阶段的团队分配（为目标项目创建独立的分配记录）
  // 逻辑：从源项目的 stage_allocations 读取每个团队的分配，把其中的平台ID映射成目标项目的ID
  const currentStage = db.prepare("SELECT value FROM system_config WHERE key='current_stage'").get()?.value || 'BU';
  const sourceAllocs = db.prepare('SELECT * FROM stage_allocations WHERE stage_id=?').all(currentStage);

  const upsertAlloc = db.prepare(`
    INSERT INTO stage_allocations (stage_id, team_id, platforms, slot_mode, priority)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(stage_id, team_id) DO UPDATE SET
      platforms = excluded.platforms,
      slot_mode = excluded.slot_mode,
      priority = excluded.priority
  `);

  for (const a of sourceAllocs) {
    const oldPlats = (a.platforms || '').split(',').filter(Boolean);
    // 只保留源项目中的平台ID，并映射为目标项目ID
    const mapped = oldPlats
      .map(pid => idMap[pid])       // 只映射源项目中的平台
      .filter(Boolean);             // 去掉不属于源项目的
    if (!mapped.length) continue;
    // 写入或替换该团队在当前stage的分配（只含目标项目平台）
    upsertAlloc.run(currentStage, a.team_id, mapped.join(','), a.slot_mode || 'shared', a.priority);
  }

  res.json({ success: true, message: `从 ${fromProject} 复制了 ${count} 个平台到 ${toProject}（含团队分配）` });
});

// 删除项目（及其所有平台、预约记录）
router.delete('/:project', (req, res) => {
  const { project } = req.params;
  if (!project) return res.status(400).json({ error: 'project name required' });
  if (project === 'BR2x6') return res.status(403).json({ error: '不能删除默认项目 BR2x6' });

  const db = getDB();
  db.pragma('foreign_keys = OFF');
  try {
    // 删除该项目下所有平台相关的预约和日志
    const platIds = db.prepare('SELECT id FROM platforms WHERE project=?').all(project).map(r => r.id);
    if (platIds.length) {
      db.prepare(`DELETE FROM reservations WHERE platform_id IN (${platIds.map(() => '?').join(',')})`).run(...platIds);
      db.prepare(`DELETE FROM platform_logs WHERE platform_id IN (${platIds.map(() => '?').join(',')})`).run(...platIds);
      db.prepare(`DELETE FROM chips WHERE platform_id IN (${platIds.map(() => '?').join(',')})`).run(...platIds);
    }
    // 删除该项目下的所有平台
    db.prepare('DELETE FROM platforms WHERE project=?').run(project);
    // 从 projects 表中删除
    db.prepare('DELETE FROM projects WHERE name=?').run(project);
    res.json({ success: true, message: `项目 ${project} 已删除` });
  } finally {
    db.pragma('foreign_keys = ON');
  }
});

module.exports = router;