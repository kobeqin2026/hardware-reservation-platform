const express = require('express');
const router = express.Router();
const { getDB } = require('../models/database');

// 获取某平台下的所有芯片
router.get('/', (req, res) => {
  const db = getDB();
  const { platformId } = req.query;
  let chips;
  if (platformId) {
    chips = db.prepare('SELECT * FROM chips WHERE platform_id=? ORDER BY slot').all(platformId);
  } else {
    chips = db.prepare('SELECT c.*, p.label as platform_label FROM chips c JOIN platforms p ON p.id=c.platform_id ORDER BY c.created_at DESC').all();
  }
  res.json(chips);
});

// 获取单个芯片
router.get('/:id', (req, res) => {
  const db = getDB();
  const chip = db.prepare('SELECT c.*, p.label as platform_label FROM chips c JOIN platforms p ON p.id=c.platform_id WHERE c.id=?').get(req.params.id);
  if (!chip) return res.status(404).json({ error: 'Chip not found' });
  res.json(chip);
});

// 新增芯片
router.post('/', (req, res) => {
  const { platformId, slot, serial, type, status, remark } = req.body;
  if (!platformId) return res.status(400).json({ error: 'platformId required' });

  const db = getDB();
  const exists = db.prepare('SELECT * FROM platforms WHERE id=?').get(platformId);
  if (!exists) return res.status(404).json({ error: 'Platform not found' });

  const result = db.prepare(`
    INSERT INTO chips (platform_id, slot, serial, type, status, remark)
    VALUES (?,?,?,?,?,?)
  `).run(platformId, slot || '', serial || '', type || '', status || 'idle', remark || '');

  res.json({ success: true, id: result.lastInsertRowid });
});

// 更新芯片信息
router.put('/:id', (req, res) => {
  const { slot, serial, type, status, remark } = req.body;
  const db = getDB();
  const chip = db.prepare('SELECT * FROM chips WHERE id=?').get(req.params.id);
  if (!chip) return res.status(404).json({ error: 'Chip not found' });

  db.prepare(`
    UPDATE chips SET slot=?, serial=?, type=?, status=?, remark=?, updated_at=datetime('now','localtime')
    WHERE id=?
  `).run(
    slot ?? chip.slot,
    serial ?? chip.serial,
    type ?? chip.type,
    status ?? chip.status,
    remark ?? chip.remark,
    req.params.id
  );

  res.json({ success: true });
});

// 删除芯片
router.delete('/:id', (req, res) => {
  const db = getDB();
  const chip = db.prepare('SELECT * FROM chips WHERE id=?').get(req.params.id);
  if (!chip) return res.status(404).json({ error: 'Chip not found' });
  db.prepare('DELETE FROM chips WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;