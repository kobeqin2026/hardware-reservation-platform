const express = require('express');
const router = express.Router();
const { getDB } = require('../models/database');

// 获取所有阶段（含bringup日期范围）
router.get('/', (req, res) => {
  const db = getDB();
  const stages = db.prepare('SELECT * FROM stages ORDER BY sort_order').all();
  const current = db.prepare("SELECT value FROM system_config WHERE key='current_stage'").get();
  const bringupStart = db.prepare("SELECT value FROM system_config WHERE key='bringup_start'").get()?.value || '09-28';
  const bringupEnd = db.prepare("SELECT value FROM system_config WHERE key='bringup_end'").get()?.value || '10-11';
  res.json({ stages, currentStage: current?.value || 'BU', bringupStart, bringupEnd });
});

// 更新阶段信息（时间范围等）
router.put('/:id', (req, res) => {
  const { start_week, end_week, duration_weeks, name, color, bringupStart, bringupEnd } = req.body;
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

  // 同时写入 bringup 日期范围
  if (bringupStart !== undefined) {
    db.prepare("INSERT OR REPLACE INTO system_config (key, value) VALUES ('bringup_start', ?)").run(bringupStart);
  }
  if (bringupEnd !== undefined) {
    db.prepare("INSERT OR REPLACE INTO system_config (key, value) VALUES ('bringup_end', ?)").run(bringupEnd);
  }

  // 如果 bringup 日期变化且当前是 BU 阶段，重建 day_allocations 以匹配新日期
  if (bringupStart !== undefined || bringupEnd !== undefined) {
    const finalStart = bringupStart ?? db.prepare("SELECT value FROM system_config WHERE key='bringup_start'").get()?.value;
    const finalEnd = bringupEnd ?? db.prepare("SELECT value FROM system_config WHERE key='bringup_end'").get()?.value;
    if (finalStart && finalEnd) {
      const sm = finalStart.split('-'), em = finalEnd.split('-');
      const s = new Date(2026, +sm[0]-1, +sm[1]);
      const e = new Date(2026, +em[0]-1, +em[1]);
      const days = []; const c = new Date(s);
      while (c <= e) { days.push(new Date(c).getTime()); c.setDate(c.getDate()+1); }
      
      // 从固化文件读取 day_allocations 模板数据
      const fs = require('fs');
      const path = require('path');
      const dataPath = path.join(__dirname, '..', '..', 'data', 'day_allocations_export.json');
      let templateRows = [];
      if (fs.existsSync(dataPath)) {
        templateRows = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        console.log('[stages] Loaded', templateRows.length, 'template rows from export file');
      } else {
        // 如果文件不存在，从数据库现有数据作为模板
        templateRows = db.prepare("SELECT platform_id, team_id FROM day_allocations WHERE stage_id='BU' GROUP BY platform_id, team_id").all();
        console.log('[stages] Using', templateRows.length, 'existing allocations as template');
      }
      
      // 清除当前 BU 的 day_allocations
      db.prepare("DELETE FROM day_allocations WHERE stage_id='BU'").run();
      
      // 根据模板和天数重建
      const ins = db.prepare("INSERT OR IGNORE INTO day_allocations (platform_id, date_stamp, team_id, stage_id) VALUES (?,?,?,?)");
      // 从模板建立 platform -> teams 映射
      const platTeams = {};
      for (const r of templateRows) {
        const pid = r.platform_id;
        if (!platTeams[pid]) platTeams[pid] = new Set();
        platTeams[pid].add(r.team_id || r.teamId);
      }
      let inserted = 0;
      for (const pid of Object.keys(platTeams)) {
        for (const teamId of platTeams[pid]) {
          for (const ds of days) {
            ins.run(pid, ds, teamId);
            inserted++;
          }
        }
      }
      console.log('[stages] day_allocations rebuilt for new date range:', finalStart, '~', finalEnd, '=', inserted, 'rows');
    }
  }

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