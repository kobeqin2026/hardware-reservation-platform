const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'hardware_reservation.db');

let db;

function getDB() {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
    migrate();
    seedData();
  }
  return db;
}

function initTables() {
  db.exec(`
    -- 阶段定义 (BU/FE/FST/PVT)
    CREATE TABLE IF NOT EXISTS stages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      color TEXT DEFAULT '#409EFF',
      start_week TEXT DEFAULT '',           -- 开始周，如 'W40'
      end_week TEXT DEFAULT '',             -- 结束周，如 'W41'
      duration_weeks INTEGER DEFAULT 0      -- 持续周数
    );

    -- 团队
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      owners TEXT NOT NULL DEFAULT '',    -- 逗号分隔
      color TEXT DEFAULT '#67C23A',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 平台
    CREATE TABLE IF NOT EXISTS platforms (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,                -- Socket1, Socket2 ...
      project TEXT NOT NULL DEFAULT 'BR2x6',  -- 所属项目
      status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','in_use','maintenance','ft_reserved','backup')),
      location TEXT DEFAULT '',
      config_json TEXT DEFAULT '{}',      -- 硬件配置
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 阶段分配模板 (stage -> team -> platforms)
    CREATE TABLE IF NOT EXISTS stage_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stage_id TEXT NOT NULL REFERENCES stages(id),
      team_id TEXT NOT NULL REFERENCES teams(id),
      platforms TEXT NOT NULL,            -- 逗号分隔的平台ID列表
      slot_mode TEXT DEFAULT 'shared' CHECK(slot_mode IN ('full','shared')),
      priority INTEGER DEFAULT 1,        -- 0=P0, 1=P1, 2=P2 ...
      created_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(stage_id, team_id)
    );

    -- 使用记录 / 预约
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id TEXT NOT NULL REFERENCES teams(id),
      platform_id TEXT NOT NULL REFERENCES platforms(id),
      stage_id TEXT REFERENCES stages(id),
      purpose TEXT DEFAULT '',
      owner TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','cancelled')),
      started_at TEXT DEFAULT (datetime('now','localtime')),
      ended_at TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 平台状态变更日志
    CREATE TABLE IF NOT EXISTS platform_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform_id TEXT NOT NULL REFERENCES platforms(id),
      action TEXT NOT NULL,               -- 'stage_switch','reserve','release','maintenance','health_check'
      team_id TEXT REFERENCES teams(id),
      detail TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 芯片信息
    CREATE TABLE IF NOT EXISTS chips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform_id TEXT NOT NULL REFERENCES platforms(id),
      slot TEXT DEFAULT '',                -- Slot0, Slot1 ...
      serial TEXT DEFAULT '',              -- 芯片序列号
      type TEXT DEFAULT '',                -- BR200-768, BR200-132 etc.
      status TEXT DEFAULT 'idle' CHECK(status IN ('idle','testing','done','failed')),
      remark TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 当前激活的阶段
    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- 项目列表
    CREATE TABLE IF NOT EXISTS projects (
      name TEXT PRIMARY KEY,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
      `);
    }

    function migrate() {
      // 为 platforms 表添加 project 列（如果不存在）
      const cols = db.prepare("PRAGMA table_info('platforms')").all();
      if (!cols.find(c => c.name === 'project')) {
        db.exec("ALTER TABLE platforms ADD COLUMN project TEXT NOT NULL DEFAULT 'BR2x6'");
        console.log('[migrate] added project column to platforms');
      }
      // 设置所有现有平台为 BR2x6
      db.exec("UPDATE platforms SET project='BR2x6' WHERE project IS NULL OR project=''");
    }

    function seedData() {
  const stageCount = db.prepare('SELECT COUNT(*) as c FROM stages').get().c;
  if (stageCount > 0) return;

  const insertStage = db.prepare('INSERT INTO stages (id, name, sort_order, color, start_week, end_week, duration_weeks) VALUES (?, ?, ?, ?, ?, ?, ?)');
  insertStage.run('BU', 'Bring Up', 1, '#F56C6C', 'W40', 'W41', 2);
  insertStage.run('FE', 'Feature Enable', 2, '#E6A23C', 'W42', 'W49', 8);
  insertStage.run('FST', 'Feature Stress Test', 3, '#409EFF', 'W50', 'W52', 3);
  insertStage.run('PVT', 'PVT Validation', 4, '#67C23A', 'W1', 'W8', 8);

  const insertTeam = db.prepare('INSERT INTO teams (id, name, display_name, owners, color) VALUES (?, ?, ?, ?, ?)');
  const TEAMS = [
    ['board',    'Board',    'Board',    'board',    '#F44336'],
    ['firmware', 'Firmware', 'Firmware', 'firmware', '#FF9800'],
    ['diag',     'Diag',     'Diag',     'diag',     '#FFC107'],
    ['jtag',     'JTAG',     'JTAG',     'jtag',     '#4CAF50'],
    ['ethernet', 'Ethernet', 'Ethernet', 'ethernet', '#009688'],
    ['pcie',     'PCIe',     'PCIe',     'pcie',     '#2196F3'],
    ['hbm',      'HBM',      'HBM',      'hbm',      '#3F51B5'],
    ['ucie',     'UCIe',     'UCIe',     'ucie',     '#9C27B0'],
    ['slt',      'SLT',      'SLT',      'slt',      '#E91E63'],
    ['ppo',      'PPO',      'PPO',      'ppo',      '#795548'],
    ['swci',     'SWCI',     'SWCI',     'swci',     '#607D8B'],
    ['swmodel',  'SWModel',  'SWModel',  'swmodel',  '#00BCD4'],
    ['swtool',   'SWTOOL',   'SWTOOL',   'swtool',   '#8BC34A'],
    ['kmd',      'KMD',      'KMD',      'kmd',      '#CDDC39'],
    ['umd',      'UMD',      'UMD',      'umd',      '#FF5722'],
    ['video',    'Video',    'Video',    'video',    '#E040FB'],
  ];
  TEAMS.forEach(t => insertTeam.run(...t));

  // 创建15个平台
  const insertPlatform = db.prepare('INSERT INTO platforms (id, label, status) VALUES (?, ?, ?)');
  for (let i = 1; i <= 15; i++) {
    const sid = `Socket${i}`;
    if (i <= 12) {
      insertPlatform.run(sid, sid, 'idle');
    } else if (i === 13) {
      insertPlatform.run(sid, sid, 'backup');      // Socket13 = backup
    } else if (i === 14) {
      insertPlatform.run(sid, sid, 'backup');      // Socket14 = backup
    } else {
      insertPlatform.run(sid, sid, 'ft_reserved'); // Socket15 = FT
    }
  }

  // 创建阶段分配
  const insertAlloc = db.prepare('INSERT INTO stage_allocations (stage_id, team_id, platforms, slot_mode, priority) VALUES (?, ?, ?, ?, ?)');

  const ALLOC = [
    // BU
    { s: 'BU', t: 'board',    p: 'Socket1,Socket2,Socket3,Socket4',                 m: 'shared', r: 0 },
    { s: 'BU', t: 'jtag',     p: 'Socket1,Socket2,Socket3,Socket4,Socket5',         m: 'shared', r: 0 },
    { s: 'BU', t: 'firmware', p: 'Socket1,Socket2',                                 m: 'shared', r: 1 },
    { s: 'BU', t: 'pcie',     p: 'Socket1,Socket2',                                 m: 'shared', r: 1 },
    { s: 'BU', t: 'hbm',      p: 'Socket1,Socket2',                                 m: 'shared', r: 1 },
    { s: 'BU', t: 'ucie',     p: 'Socket1,Socket2,Socket3,Socket4',                 m: 'shared', r: 1 },
    { s: 'BU', t: 'ethernet', p: 'Socket1,Socket2,Socket5',                         m: 'shared', r: 1 },
    { s: 'BU', t: 'diag',     p: 'Socket1,Socket2',                                 m: 'shared', r: 1 },
    { s: 'BU', t: 'swtool',   p: 'Socket1,Socket2',                                 m: 'shared', r: 1 },
    // FE
    { s: 'FE', t: 'board',    p: 'Socket1,Socket4,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13', m: 'shared', r: 0 },
    { s: 'FE', t: 'jtag',     p: 'Socket1,Socket2,Socket3,Socket4,Socket5',         m: 'shared', r: 0 },
    { s: 'FE', t: 'firmware', p: 'Socket1,Socket2',                                 m: 'shared', r: 1 },
    { s: 'FE', t: 'pcie',     p: 'Socket1,Socket2,Socket3,Socket4,Socket5,Socket6', m: 'shared', r: 0 },
    { s: 'FE', t: 'hbm',      p: 'Socket1,Socket2,Socket3,Socket4,Socket5,Socket6,Socket7', m: 'shared', r: 0 },
    { s: 'FE', t: 'ucie',     p: 'Socket1,Socket2,Socket3,Socket4,Socket5,Socket6,Socket7,Socket8', m: 'shared', r: 1 },
    { s: 'FE', t: 'ethernet', p: 'Socket1,Socket2,Socket3,Socket4,Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 1 },
    { s: 'FE', t: 'diag',     p: 'Socket1,Socket2,Socket3,Socket4,Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 1 },
    { s: 'FE', t: 'swtool',   p: 'Socket1',                                         m: 'shared', r: 1 },
    { s: 'FE', t: 'kmd',      p: 'Socket3,Socket4,Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 1 },
    { s: 'FE', t: 'umd',      p: 'Socket3,Socket4,Socket5,Socket6,Socket7,Socket8', m: 'shared', r: 2 },
    { s: 'FE', t: 'video',    p: 'Socket5,Socket6',                                 m: 'shared', r: 2 },
    { s: 'FE', t: 'swci',     p: 'Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 2 },
    { s: 'FE', t: 'swmodel',  p: 'Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 2 },
    { s: 'FE', t: 'slt',      p: '',                                                m: 'shared', r: 2 },
    // FST
    { s: 'FST', t: 'board',   p: 'Socket1,Socket4,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13', m: 'shared', r: 0 },
    { s: 'FST', t: 'jtag',    p: 'Socket1,Socket2,Socket3,Socket4,Socket5',         m: 'shared', r: 0 },
    { s: 'FST', t: 'pcie',    p: 'Socket1,Socket2,Socket3,Socket4,Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 0 },
    { s: 'FST', t: 'hbm',     p: 'Socket1,Socket2,Socket3,Socket4,Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 0 },
    { s: 'FST', t: 'ucie',    p: 'Socket1,Socket2,Socket3,Socket4,Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 1 },
    { s: 'FST', t: 'ethernet',p: 'Socket1,Socket2,Socket3,Socket4,Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 1 },
    { s: 'FST', t: 'diag',    p: 'Socket1,Socket2,Socket3,Socket4,Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 1 },
    { s: 'FST', t: 'slt',     p: 'Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13', m: 'shared', r: 0 },
    { s: 'FST', t: 'kmd',     p: 'Socket3,Socket4,Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 0 },
    { s: 'FST', t: 'umd',     p: 'Socket3,Socket4,Socket5,Socket6,Socket7,Socket8', m: 'shared', r: 1 },
    { s: 'FST', t: 'video',   p: 'Socket5,Socket6',                                 m: 'shared', r: 1 },
    { s: 'FST', t: 'swci',    p: 'Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 1 },
    { s: 'FST', t: 'swmodel', p: 'Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 1 },
    { s: 'FST', t: 'ppo',     p: 'Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 2 },
    { s: 'FST', t: 'swtool',  p: '',                                                m: 'shared', r: 2 },
    // PVT
    { s: 'PVT', t: 'pcie',    p: 'Socket1,Socket2,Socket3,Socket4,Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 0 },
    { s: 'PVT', t: 'hbm',     p: 'Socket1,Socket2,Socket3,Socket4,Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 0 },
    { s: 'PVT', t: 'ethernet',p: 'Socket1,Socket2,Socket3,Socket4,Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 0 },
    { s: 'PVT', t: 'ucie',    p: 'Socket1,Socket2,Socket3,Socket4,Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 1 },
    { s: 'PVT', t: 'diag',    p: 'Socket1,Socket2,Socket3,Socket4,Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 1 },
    { s: 'PVT', t: 'slt',     p: 'Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13', m: 'shared', r: 0 },
    { s: 'PVT', t: 'kmd',     p: 'Socket3,Socket4,Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 0 },
    { s: 'PVT', t: 'umd',     p: 'Socket3,Socket4,Socket5,Socket6,Socket7,Socket8', m: 'shared', r: 1 },
    { s: 'PVT', t: 'video',   p: 'Socket5,Socket6',                                 m: 'shared', r: 2 },
    { s: 'PVT', t: 'swci',    p: 'Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 1 },
    { s: 'PVT', t: 'swmodel', p: 'Socket5,Socket6,Socket7,Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 1 },
    { s: 'PVT', t: 'ppo',     p: 'Socket8,Socket9,Socket10,Socket11,Socket12,Socket13,Socket14', m: 'shared', r: 1 },
  ];
  ALLOC.forEach(a => insertAlloc.run(a.s, a.t, a.p, a.m, a.r));

  // 设置默认阶段为BU
  db.prepare('INSERT INTO system_config (key, value) VALUES (?, ?)').run('current_stage', 'BU');

  // 同步项目到 projects 表
  db.exec(`INSERT OR IGNORE INTO projects (name) SELECT DISTINCT project FROM platforms WHERE project IS NOT NULL AND project!=''`);

  console.log('[DB] Seed data loaded successfully');
}

module.exports = { getDB };