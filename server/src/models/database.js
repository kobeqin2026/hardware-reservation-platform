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
      label TEXT NOT NULL,                -- BU1, BU2, BU3, BU4
      type TEXT NOT NULL DEFAULT 'socket' CHECK(type IN ('socket','solder_down')),
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
      // 先备份原始 chips 数据，然后重建表允许 NULL
      // 删除外键约束，允许 platform_id 为 NULL
      const chipNullable = db.prepare("PRAGMA table_info('chips')").all().find(c => c.name === 'platform_id');
      if (chipNullable && chipNullable.notnull) {
        console.log('[migrate] relaxing chips.platform_id to allow NULL');
        db.pragma('foreign_keys = OFF');
        db.exec(`
          CREATE TABLE IF NOT EXISTS chips_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform_id TEXT REFERENCES platforms(id),
            slot TEXT DEFAULT '',
            serial TEXT DEFAULT '',
            type TEXT DEFAULT '',
            status TEXT DEFAULT 'idle' CHECK(status IN ('idle','testing','done','failed')),
            remark TEXT DEFAULT '',
            asic_id TEXT DEFAULT '',
            uuid TEXT DEFAULT '',
            mbist_result TEXT DEFAULT '',
            ft_status TEXT DEFAULT '',
            slt_status TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
          )
        `);
        db.exec('INSERT INTO chips_new SELECT * FROM chips');
        db.exec('DROP TABLE chips');
        db.exec('ALTER TABLE chips_new RENAME TO chips');
        db.pragma('foreign_keys = ON');
        console.log('[migrate] chips.platform_id now allows NULL');
      }
      const cols = db.prepare("PRAGMA table_info('platforms')").all();
      if (!cols.find(c => c.name === 'project')) {
        db.exec("ALTER TABLE platforms ADD COLUMN project TEXT NOT NULL DEFAULT 'BR2x6'");
        console.log('[migrate] added project column to platforms');
      }
      // 设置所有现有平台为 BR2x6
      db.exec("UPDATE platforms SET project='BR2x6' WHERE project IS NULL OR project=''");

      // 为 chips 表添加新列 (ASIC ID, UUID, MBist, FT, SLT)
      const chipCols = db.prepare("PRAGMA table_info('chips')").all();
      if (!chipCols.find(c => c.name === 'asic_id')) {
        db.exec("ALTER TABLE chips ADD COLUMN asic_id TEXT DEFAULT ''");
        console.log('[migrate] added asic_id to chips');
      }
      if (!chipCols.find(c => c.name === 'uuid')) {
        db.exec("ALTER TABLE chips ADD COLUMN uuid TEXT DEFAULT ''");
        console.log('[migrate] added uuid to chips');
      }
      if (!chipCols.find(c => c.name === 'mbist_result')) {
        db.exec("ALTER TABLE chips ADD COLUMN mbist_result TEXT DEFAULT ''");
        console.log('[migrate] added mbist_result to chips');
      }
      if (!chipCols.find(c => c.name === 'ft_status')) {
        db.exec("ALTER TABLE chips ADD COLUMN ft_status TEXT DEFAULT ''");
        console.log('[migrate] added ft_status to chips');
      }
      if (!chipCols.find(c => c.name === 'slt_status')) {
        db.exec("ALTER TABLE chips ADD COLUMN slt_status TEXT DEFAULT ''");
        console.log('[migrate] added slt_status to chips');
      }

      // 为 platforms 表添加 type 列（如果不存在）
      const platCols = db.prepare("PRAGMA table_info('platforms')").all();
      if (!platCols.find(c => c.name === 'type')) {
        db.exec("ALTER TABLE platforms ADD COLUMN type TEXT NOT NULL DEFAULT 'socket'");
        console.log('[migrate] added type column to platforms');
      }
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

  // 创建15个平台：BU1-BU15 (循环 socket,socket,solder_down,solder_down)
  const insertPlatform = db.prepare('INSERT INTO platforms (id, label, type, status) VALUES (?, ?, ?, ?)');
  const platTypes = ['socket', 'socket', 'solder_down', 'solder_down'];
  for (let i = 1; i <= 15; i++) {
    insertPlatform.run('BU' + i, 'BU' + i, platTypes[(i - 1) % 4], 'idle');
  }

  // 创建阶段分配（所有平台均分）
  const insertAlloc = db.prepare('INSERT INTO stage_allocations (stage_id, team_id, platforms, slot_mode, priority) VALUES (?, ?, ?, ?, ?)');

  const ALLOC = [
    // BU — 所有团队分配所有15个平台
    { s: 'BU', t: 'board',    p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 0 },
    { s: 'BU', t: 'jtag',     p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 0 },
    { s: 'BU', t: 'firmware', p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
    { s: 'BU', t: 'pcie',     p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
    { s: 'BU', t: 'hbm',      p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
    { s: 'BU', t: 'ucie',     p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
    { s: 'BU', t: 'ethernet', p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
    { s: 'BU', t: 'diag',     p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
    { s: 'BU', t: 'swtool',   p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
    // FE
    { s: 'FE', t: 'board',    p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 0 },
    { s: 'FE', t: 'jtag',     p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 0 },
    { s: 'FE', t: 'firmware', p: 'BU1,BU2',                  m: 'shared', r: 1 },
    { s: 'FE', t: 'pcie',     p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 0 },
    { s: 'FE', t: 'hbm',      p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 0 },
    { s: 'FE', t: 'ucie',     p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
    { s: 'FE', t: 'ethernet', p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
    { s: 'FE', t: 'diag',     p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
    { s: 'FE', t: 'swtool',   p: 'BU1',                      m: 'shared', r: 1 },
    { s: 'FE', t: 'kmd',      p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
    { s: 'FE', t: 'umd',      p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 2 },
    { s: 'FE', t: 'video',    p: 'BU1,BU2',                  m: 'shared', r: 2 },
    { s: 'FE', t: 'swci',     p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 2 },
    { s: 'FE', t: 'swmodel',  p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 2 },
    { s: 'FE', t: 'slt',      p: '',                         m: 'shared', r: 2 },
    // FST
    { s: 'FST', t: 'board',   p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 0 },
    { s: 'FST', t: 'jtag',    p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 0 },
    { s: 'FST', t: 'pcie',    p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 0 },
    { s: 'FST', t: 'hbm',     p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 0 },
    { s: 'FST', t: 'ucie',    p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
    { s: 'FST', t: 'ethernet',p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
    { s: 'FST', t: 'diag',    p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
    { s: 'FST', t: 'slt',     p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 0 },
    { s: 'FST', t: 'kmd',     p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 0 },
    { s: 'FST', t: 'umd',     p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
    { s: 'FST', t: 'video',   p: 'BU1,BU2',                  m: 'shared', r: 1 },
    { s: 'FST', t: 'swci',    p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
    { s: 'FST', t: 'swmodel', p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
    { s: 'FST', t: 'ppo',     p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 2 },
    { s: 'FST', t: 'swtool',  p: '',                         m: 'shared', r: 2 },
    // PVT
    { s: 'PVT', t: 'pcie',    p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 0 },
    { s: 'PVT', t: 'hbm',     p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 0 },
    { s: 'PVT', t: 'ethernet',p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 0 },
    { s: 'PVT', t: 'ucie',    p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
    { s: 'PVT', t: 'diag',    p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
    { s: 'PVT', t: 'slt',     p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 0 },
    { s: 'PVT', t: 'kmd',     p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 0 },
    { s: 'PVT', t: 'umd',     p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
    { s: 'PVT', t: 'video',   p: 'BU1,BU2',                  m: 'shared', r: 2 },
    { s: 'PVT', t: 'swci',    p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
    { s: 'PVT', t: 'swmodel', p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
    { s: 'PVT', t: 'ppo',     p: 'BU1,BU2,BU3,BU4,BU5,BU6,BU7,BU8,BU9,BU10,BU11,BU12,BU13,BU14,BU15', m: 'shared', r: 1 },
  ];
  ALLOC.forEach(a => insertAlloc.run(a.s, a.t, a.p, a.m, a.r));

  // 设置默认阶段为BU
  db.prepare('INSERT INTO system_config (key, value) VALUES (?, ?)').run('current_stage', 'BU');

  // 同步项目到 projects 表
  db.exec(`INSERT OR IGNORE INTO projects (name) SELECT DISTINCT project FROM platforms WHERE project IS NOT NULL AND project!=''`);

  console.log('[DB] Seed data loaded successfully');
}

module.exports = { getDB };