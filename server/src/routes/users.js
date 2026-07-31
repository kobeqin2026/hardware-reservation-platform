const express = require('express');
const router = express.Router();
const { getDB } = require('../models/database');

// 预置账号
const DEFAULT_USERS = [
  { name: 'admin',   password: 'admin123',  role: 'admin', display_name: '管理员' },
  { name: 'kobe',    password: 'kobe123',   role: 'admin', display_name: 'Kobe' },
  // 每个团队的 domain owner 账号，密码 = 用户名 + 123
  { name: 'board',    password: 'board123',    role: 'owner', display_name: 'Board' },
  { name: 'firmware', password: 'firmware123', role: 'owner', display_name: 'Firmware' },
  { name: 'diag',     password: 'diag123',     role: 'owner', display_name: 'Diag' },
  { name: 'jtag',     password: 'jtag123',     role: 'owner', display_name: 'JTAG' },
  { name: 'ethernet', password: 'ethernet123', role: 'owner', display_name: 'Ethernet' },
  { name: 'pcie',     password: 'pcie123',     role: 'owner', display_name: 'PCIe' },
  { name: 'hbm',      password: 'hbm123',      role: 'owner', display_name: 'HBM' },
  { name: 'ucie',     password: 'ucie123',     role: 'owner', display_name: 'UCIe' },
  { name: 'slt',      password: 'slt123',      role: 'owner', display_name: 'SLT' },
  { name: 'ppo',      password: 'ppo123',      role: 'owner', display_name: 'PPO' },
  { name: 'swci',     password: 'swci123',     role: 'owner', display_name: 'SWCI' },
  { name: 'swmodel',  password: 'swmodel123',  role: 'owner', display_name: 'SWModel' },
  { name: 'swtool',   password: 'swtool123',   role: 'owner', display_name: 'SWTOOL' },
  { name: 'kmd',      password: 'kmd123',      role: 'owner', display_name: 'KMD' },
  { name: 'umd',      password: 'umd123',      role: 'owner', display_name: 'UMD' },
  { name: 'video',    password: 'video123',    role: 'owner', display_name: 'Video' },
];

// 初始化时确保表存在并插入默认用户
function initUsers() {
  const db = getDB();
  // 添加 users 表（如果不存在）
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      name TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner' CHECK(role IN ('admin','owner')),
      display_name TEXT DEFAULT ''
    )
  `);
  // 确保 projects 表存在并至少有一个默认项目
  db.exec(`CREATE TABLE IF NOT EXISTS projects (name TEXT PRIMARY KEY, created_at TEXT DEFAULT (datetime('now','localtime')))`);
  db.prepare("INSERT OR IGNORE INTO projects (name) VALUES ('BR288Y')").run();
  // 插入默认用户（忽略已存在的）
  const insert = db.prepare('INSERT OR IGNORE INTO users (name, password, role, display_name) VALUES (?, ?, ?, ?)');
  for (const u of DEFAULT_USERS) {
    insert.run(u.name, u.password, u.role, u.display_name);
  }
}

// 登录
router.post('/login', (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  const db = getDB();
  const user = db.prepare('SELECT name, role, display_name FROM users WHERE name=? AND password=?').get(name, password);
  if (!user) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  res.json({ user });
});

// 获取用户列表（管理员用）
router.get('/', (req, res) => {
  const db = getDB();
  const users = db.prepare('SELECT name, role, display_name FROM users ORDER BY name').all();
  res.json({ users });
});

// 添加用户（管理员）
router.post('/', (req, res) => {
  const { name, password, display_name, role } = req.body;
  if (!name || !password) return res.status(400).json({ error: 'name and password required' });
  const db = getDB();
  const existing = db.prepare('SELECT name FROM users WHERE name=?').get(name);
  if (existing) return res.status(409).json({ error: '用户已存在' });
  db.prepare('INSERT INTO users (name, password, role, display_name) VALUES (?, ?, ?, ?)').run(name, password, role || 'owner', display_name || name);
  // role=owner 的用户同步创建一个团队（如果不存在）
  if ((role || 'owner') === 'owner') {
    const teamExists = db.prepare('SELECT id FROM teams WHERE id=?').get(name);
    if (!teamExists) {
      const colors = ['#F44336','#FF9800','#FFC107','#4CAF50','#009688','#2196F3','#3F51B5','#9C27B0','#E91E63','#795548','#607D8B','#00BCD4','#8BC34A','#CDDC39','#FF5722','#E040FB'];
      const colorIdx = db.prepare('SELECT COUNT(*) as c FROM teams').get().c;
      db.prepare('INSERT INTO teams (id, name, display_name, owners, color) VALUES (?, ?, ?, ?, ?)').run(name, display_name || name, display_name || name, name, colors[colorIdx % colors.length]);
    }
  }
  res.json({ success: true });
});

// 更新用户信息（管理员）
router.put('/:name', (req, res) => {
  const { display_name, role, password } = req.body;
  const db = getDB();
  const existing = db.prepare('SELECT name FROM users WHERE name=?').get(req.params.name);
  if (!existing) return res.status(404).json({ error: '用户不存在' });
  const updates = [];
  const params = [];
  if (display_name !== undefined) { updates.push('display_name=?'); params.push(display_name); }
  if (role !== undefined) { updates.push('role=?'); params.push(role); }
  if (password !== undefined && password) { updates.push('password=?'); params.push(password); }
  if (updates.length) {
    params.push(req.params.name);
    db.prepare(`UPDATE users SET ${updates.join(',')} WHERE name=?`).run(...params);
  }
  // 如果用户是 owner 且 display_name 变了，同步更新团队
  const user = db.prepare('SELECT name, role, display_name FROM users WHERE name=?').get(req.params.name);
  if (user.role === 'owner') {
    const team = db.prepare('SELECT id FROM teams WHERE id=?').get(req.params.name);
    if (team) {
      if (display_name) {
        db.prepare('UPDATE teams SET display_name=?, name=? WHERE id=?').run(display_name, display_name, req.params.name);
      }
    } else {
      // 不存在则创建
      const colors = ['#F44336','#FF9800','#FFC107','#4CAF50','#009688','#2196F3','#3F51B5','#9C27B0','#E91E63','#795548','#607D8B','#00BCD4','#8BC34A','#CDDC39','#FF5722','#E040FB'];
      const colorIdx = db.prepare('SELECT COUNT(*) as c FROM teams').get().c;
      db.prepare('INSERT INTO teams (id, name, display_name, owners, color) VALUES (?, ?, ?, ?, ?)').run(req.params.name, display_name || req.params.name, display_name || req.params.name, req.params.name, colors[colorIdx % colors.length]);
    }
  }
  res.json({ success: true });
});

// 删除用户（管理员）
router.delete('/:name', (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT name FROM users WHERE name=?').get(req.params.name);
  if (!existing) return res.status(404).json({ error: '用户不存在' });
  if (req.params.name === 'admin') return res.status(403).json({ error: '不能删除管理员' });
  // 删除用户时同步清理团队相关数据并删除团队
  db.prepare('DELETE FROM reservations WHERE team_id=?').run(req.params.name);
  db.prepare('DELETE FROM platform_logs WHERE team_id=?').run(req.params.name);
  db.prepare('DELETE FROM stage_allocations WHERE team_id=?').run(req.params.name);
  db.prepare('DELETE FROM teams WHERE id=?').run(req.params.name);
  db.prepare('DELETE FROM users WHERE name=?').run(req.params.name);
  res.json({ success: true });
});

// 初始化
initUsers();

module.exports = router;