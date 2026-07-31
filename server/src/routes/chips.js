const express = require('express');
const router = express.Router();
const { getDB } = require('../models/database');

// 获取芯片列表
router.get('/', (req, res) => {
  const db = getDB();
  const { platformId } = req.query;
  let chips;
  if (platformId) {
    chips = db.prepare('SELECT c.*, p.label as platform_label FROM chips c LEFT JOIN platforms p ON p.id=c.platform_id WHERE c.platform_id=? ORDER BY c.slot').all(platformId);
  } else {
    chips = db.prepare('SELECT c.*, p.label as platform_label FROM chips c LEFT JOIN platforms p ON p.id=c.platform_id ORDER BY c.created_at DESC').all();
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

// 新增芯片（platformId 可为空，表示未分配平台）
router.post('/', (req, res) => {
  const { platformId, slot, serial, type, status, remark, asicId, uuid, mbistResult, ftStatus, sltStatus } = req.body;

  const db = getDB();
  // 如果指定了平台，验证平台存在
  if (platformId) {
    const exists = db.prepare('SELECT * FROM platforms WHERE id=?').get(platformId);
    if (!exists) return res.status(404).json({ error: 'Platform not found' });
  }

  const result = db.prepare(`
    INSERT INTO chips (platform_id, slot, serial, type, status, remark, asic_id, uuid, mbist_result, ft_status, slt_status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(platformId || null, slot || '', serial || '', type || '', status || 'idle', remark || '', asicId || '', uuid || '', mbistResult || '', ftStatus || '', sltStatus || '');

  res.json({ success: true, id: result.lastInsertRowid });
});

// 更新芯片信息（可更新所属平台）
router.put('/:id', (req, res) => {
  const { platformId, slot, serial, type, status, remark, asicId, uuid, mbistResult, ftStatus, sltStatus } = req.body;
  const db = getDB();
  const chip = db.prepare('SELECT * FROM chips WHERE id=?').get(req.params.id);
  if (!chip) return res.status(404).json({ error: 'Chip not found' });

  // 如果指定了平台，验证存在
  if (platformId && platformId !== chip.platform_id) {
    const p = db.prepare('SELECT id FROM platforms WHERE id=?').get(platformId);
    if (!p) return res.status(404).json({ error: 'Platform not found' });
  }

  // 可选的：更新 platform_id
  const newPlatformId = platformId !== undefined ? (platformId || null) : chip.platform_id;

  db.prepare(`
    UPDATE chips SET platform_id=?, slot=?, serial=?, type=?, status=?, remark=?, asic_id=?, uuid=?, mbist_result=?, ft_status=?, slt_status=?, updated_at=datetime('now','localtime')
    WHERE id=?
  `).run(
    newPlatformId,
    slot ?? chip.slot,
    serial ?? chip.serial,
    type ?? chip.type,
    status ?? chip.status,
    remark ?? chip.remark,
    asicId ?? chip.asic_id,
    uuid ?? chip.uuid,
    mbistResult ?? chip.mbist_result,
    ftStatus ?? chip.ft_status,
    sltStatus ?? chip.slt_status,
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

// 按 ASIC ID 绑定芯片到平台（一颗芯片只能绑定一个平台）
router.put('/by-asic/:asicId/bind', (req, res) => {
  const { asicId } = req.params;
  const { platformId } = req.body; // null 表示解除绑定
  const db = getDB();
  const chip = db.prepare('SELECT id FROM chips WHERE asic_id=?').get(asicId);
  if (!chip) return res.status(404).json({ error: 'Chip not found' });
  db.prepare('UPDATE chips SET platform_id=? WHERE id=?').run(platformId || null, chip.id);
  res.json({ success: true, chipId: chip.id, platformId: platformId || null });
});

module.exports = router;