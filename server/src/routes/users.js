const express = require('express');
const router = express.Router();
const { getDB } = require('../models/database');

// 预置账号: 从环境变量注入(公开仓库不含明文凭据)
// 首次部署在 ~/skills/.env 配置 INITIAL_USERS(JSON 数组) 或 ADMIN_PASSWORD(单管理员);
// 未配置则不自动建号(用户表已存在时不受影响)
function loadDefaultUsers() {
  try {
    const raw = process.env.INITIAL_USERS;
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) return arr;
    }
  } catch (e) {
    console.error('[users] INITIAL_USERS 解析失败:', e.message);
  }
  const adminPwd = process.env.ADMIN_PASSWORD || '';
  if (adminPwd) {
    return [{ name: 'admin', password: adminPwd, role: 'admin', display_name: '管理员' }];
  }
  return [];
}
const DEFAULT_USERS = loadDefaultUsers();

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
  db.prepare('INSERT OR IGNORE INTO projects (name) VALUES (?)').run(process.env.DEFAULT_PROJECT || 'default-project');
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