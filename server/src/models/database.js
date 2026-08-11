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
      project TEXT NOT NULL DEFAULT 'BR288Y',  -- 所属项目
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

    -- 团队分配细粒度存储（按平台+天+团队）
    CREATE TABLE IF NOT EXISTS day_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform_id TEXT NOT NULL,
      date_stamp INTEGER NOT NULL,
      team_id TEXT NOT NULL,
      stage_id TEXT DEFAULT 'BU',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(platform_id, date_stamp, team_id, stage_id)
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
        // 新数据库直接 ALTER 列，不重建表
        const colCount = db.prepare("PRAGMA table_info('chips')").all().length;
        if (colCount < 10) {
          for (const col of ['asic_id','uuid','mbist_result','ft_status','slt_status']) {
            try { db.exec("ALTER TABLE chips ADD COLUMN "+col+" TEXT DEFAULT ''"); } catch(e) {}
          }
          return;
        }
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
        db.exec("ALTER TABLE platforms ADD COLUMN project TEXT NOT NULL DEFAULT 'BR288Y'");
        console.log('[migrate] added project column to platforms');
      }
      // 设置所有现有平台为 BR288Y
      db.exec("UPDATE platforms SET project='BR288Y' WHERE project IS NULL OR project=''");

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
    ['mbist',    'MBIST',    'MBIST',    'mbist',    '#FF6F00'],
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
    // BU — 按实际团队分配（非全部）
    { s: 'BU', t: 'board',    p: 'BU1,BU2,BU3,BU5', m: 'shared', r: 0 },
    { s: 'BU', t: 'diag',     p: 'BU13,BU14', m: 'shared', r: 1 },
    { s: 'BU', t: 'ethernet', p: 'BU12', m: 'shared', r: 1 },
    { s: 'BU', t: 'firmware', p: 'BU1,BU4,BU7,BU10,BU15', m: 'shared', r: 1 },
    { s: 'BU', t: 'hbm',      p: 'BU1,BU2,BU3,BU5,BU8,BU13', m: 'shared', r: 1 },
    { s: 'BU', t: 'jtag',     p: 'BU2,BU4,BU9,BU11', m: 'shared', r: 0 },
    { s: 'BU', t: 'kmd',      p: 'BU6,BU10,BU14', m: 'shared', r: 1 },
    { s: 'BU', t: 'mbist',    p: 'BU1,BU3,BU7,BU9,BU11,BU15', m: 'shared', r: 1 },
    { s: 'BU', t: 'pcie',     p: 'BU1,BU4,BU6,BU10,BU12', m: 'shared', r: 1 },
    { s: 'BU', t: 'ppo',      p: 'BU5,BU8,BU13', m: 'shared', r: 1 },
    { s: 'BU', t: 'slt',      p: 'BU7,BU9,BU14', m: 'shared', r: 1 },
    { s: 'BU', t: 'swci',     p: 'BU2,BU6,BU11,BU15', m: 'shared', r: 1 },
    { s: 'BU', t: 'swmodel',  p: 'BU3,BU8,BU12', m: 'shared', r: 1 },
    { s: 'BU', t: 'swtool',   p: 'BU4,BU5,BU9,BU10,BU14', m: 'shared', r: 1 },
    { s: 'BU', t: 'ucie',     p: 'BU1,BU6,BU11,BU15', m: 'shared', r: 1 },
    { s: 'BU', t: 'umd',      p: 'BU2,BU7,BU12,BU13', m: 'shared', r: 1 },
    { s: 'BU', t: 'video',    p: 'BU3,BU4,BU8,BU14', m: 'shared', r: 1 },
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

  // 从固化的 JSON 文件导入 day_allocations 数据（不受代码改动影响）
  // 如果 JSON 文件存在，用它来初始化；否则用旧的硬编码 MATRIX 兜底
  try {
    const fs = require('fs');
    const dataPath = path.join(__dirname, '..', '..', 'data', 'day_allocations_export.json');
    const configPath = path.join(__dirname, '..', '..', 'data', 'bringup_config.json');
    
    if (fs.existsSync(dataPath) && fs.existsSync(configPath)) {
      const exportedRows = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // 检查数据库是否已有数据
      const da = db.prepare("SELECT COUNT(*) as c FROM day_allocations").get().c;
      if (da === 0) {
        const ins = db.prepare("INSERT OR IGNORE INTO day_allocations (platform_id, date_stamp, team_id, stage_id) VALUES (?,?,?,?)");
        const txn = db.transaction(() => {
          for (const row of exportedRows) {
            ins.run(row.platform_id, row.date_stamp, row.team_id, row.stage_id || 'BU');
          }
        });
        txn();
        console.log('[DB] day_allocations loaded from export file:', exportedRows.length, 'rows');
      }
      
      // 设置 bringup 日期范围（如果还没有设置）
      const existingStart = db.prepare("SELECT value FROM system_config WHERE key='bringup_start'").get();
      if (!existingStart && config.bringupStart) {
        db.prepare("INSERT OR REPLACE INTO system_config (key, value) VALUES ('bringup_start', ?)").run(config.bringupStart);
        db.prepare("INSERT OR REPLACE INTO system_config (key, value) VALUES ('bringup_end', ?)").run(config.bringupEnd);
        console.log('[DB] Bringup range set to:', config.bringupStart, '~', config.bringupEnd);
      }
    } else {
      // fallback: 旧的硬编码 MATRIX（仅首次初始化）
      const bs = '09-28', be = '10-11';
      const s = new Date(2026, 8, 28), e = new Date(2026, 9, 11);
      const days = []; const c2 = new Date(s);
      while (c2 <= e) { days.push(new Date(c2).getTime()); c2.setDate(c2.getDate()+1); }
      const da = db.prepare("SELECT COUNT(*) as c FROM day_allocations").get().c;
      if (da === 0) {
        const MATRIX = [
          ['board','board','board','board','slt','slt','board','board','board','board','board','board','board','board'],
          ['board','board','kmd','kmd','kmd','kmd','kmd','kmd','kmd','kmd','kmd','kmd','kmd','kmd'],
          ['jtag','jtag','jtag','jtag','diag','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel'],
          ['jtag','jtag','jtag','jtag','jtag','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel'],
          ['firmware','firmware','firmware','slt','slt','swmodel','ppo','ppo','ppo','ppo','ppo','ppo','ppo','ppo'],
          ['swtool','swtool','ucie','ucie','slt','slt','slt','slt','slt','slt','slt','slt','slt','slt'],
          ['pcie','pcie','pcie','pcie','pcie','pcie','pcie','pcie','pcie','pcie','pcie','pcie','pcie','pcie'],
          ['pcie','pcie','pcie','pcie','pcie','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel','swmodel'],
          ['hbm','hbm','hbm','hbm','hbm','hbm','hbm','hbm','hbm','hbm','hbm','hbm','hbm','hbm'],
          ['hbm','hbm','hbm','hbm','video','video','hbm','hbm','hbm','hbm','hbm','hbm','hbm','hbm'],
          ['ucie','ucie','ucie','ucie','ucie','ucie','ucie','ucie','ucie','ucie','ucie','ucie','ucie','ucie'],
          ['ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet'],
          ['diag','diag','diag','diag','diag','diag','diag','diag','diag','diag','diag','diag','diag','diag'],
          ['diag','diag','umd','umd','umd','umd','umd','','swci','swci','swci','swci','swci','swci'],
          ['mbist','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet','ethernet'],
        ];
        const ins = db.prepare("INSERT OR IGNORE INTO day_allocations (platform_id, date_stamp, team_id, stage_id) VALUES (?,?,?,?)");
        const txn = db.transaction(() => {
          for (let bi = 0; bi < 15; bi++) {
            const pid = 'BU' + (bi + 1);
            for (let di = 0; di < 14; di++) {
              const t = MATRIX[bi][di].trim().toLowerCase();
              if (!t) continue;
              ins.run(pid, days[di], t);
            }
          }
        });
        txn();
        console.log('[DB] day_allocations seeded (fallback MATRIX):', db.prepare("SELECT COUNT(*) as c FROM day_allocations").get().c);
      }
    }
  } catch (e) {
    console.error('[DB] Error loading day_allocations export:', e.message);
  }

  // 同步项目到 projects 表（仅首次）
  db.exec(`INSERT OR IGNORE INTO projects (name) SELECT DISTINCT project FROM platforms WHERE project IS NOT NULL AND project!=''`);

  console.log('[DB] Seed data loaded successfully');
}

module.exports = { getDB };