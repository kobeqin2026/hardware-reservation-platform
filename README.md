# 硬件资源预约平台 (Hardware Reservation Platform)

## 版本历史

### v1.1.0 — 新建预约修复 + 团队分配重构 + Gantt 条状图 + 阶段联动 (2026-08-03)

#### 新功能

**新建预约对话框修复**
- 团队下拉框去除 `disabled`，admin 可手动选择任意团队
- 平台下拉框改为只显示当前项目的平台（`projectPlatforms`），避免预约到其他项目的同名平台
- 负责人字段自动跟随所选团队（从 `team.owners[0]` 获取），不再显示 admin 用户名
- 新建预约对话框打开时清空所有表单字段，避免残留

**团队分配页面 — 当前活跃 Gantt 条状图**
- 下栏「当前活跃」从简单的圆点标记改为 Gantt 条状图
- 每个活跃平台一行，彩色横条宽度 = 预约从 `started_at` 到当前的时间跨度
- 横条上显示团队名（颜色与预分配 TEAM_COLOR_MAP 统一）
- 独立 14 天时间轴，默认从最早活跃预约日期开始
- admin 可通过「编辑时间」修改时间窗（保存在 localStorage）
- 数据按当前项目过滤（`/api/platforms`）

**阶段规划 — 持续周级联更新**
- 「编辑阶段时间」弹窗中调整「持续(周)」时，当前阶段的结束周自动计算
- **级联更新后续所有阶段**：每个下游阶段的开始周 = 上一阶段结束周 + 1
- 各阶段 duration_weeks 保持不变，结束周按新开始周 + 持续自动重算
- 跨年（W40~W52 → W1~W9）自动处理

**统一团队色卡**
- Dashboard 平台卡片团队名、团队占用表团队名，全部统一使用 TeamView.vue 的 `TEAM_COLOR_MAP`
- 18 个团队的色彩在不同页面间保持一致

**API 路由加 Cache-Control**
- `platforms.js`、`reservations.js`、`dashboard.js` 关键 API 路由添加 `no-store` 缓存头

#### 移除
- **阶段规划页面**：移除「团队活动时间线」卡片（按天的日粒度团队活动展示）

#### 新增 API
- `GET /api/reservations/active-summary?project=BR288Y` — 按项目过滤的活跃预约摘要，含平台/团队/颜色/时间信息，用于 Gantt 图

---

### v1.0.5 — 平台配置行内编辑 + 芯片绑定 + 项目切换 + 数据固化 (2026-07-31)

#### 新功能

**项目切换与管理**
- 登录后自动弹出项目选择卡片（多项目时必须选项目才能进入）
- 新建项目支持两种方式：从已有项目复制全部数据，或创建空白项目
- 顶栏项目选择器可随时切换项目，所有页面数据自动刷新
- 默认项目改为 BR288Y，所有 15 个平台数据已迁移

**平台列表行内编辑模式**
- 操作列新增「编辑」按钮（黄色），admin 点击后整行进入编辑模式
- **类型 / 实验室位置 / 主板** 变为下拉框/输入框，ASIC ID 改为从芯片数据下拉选择
- **OS 信息**：IP、OS、用户、密码 四字段可编辑
- **BMC 信息**：BMC IP、用户、密码 三字段可编辑
- **JTAG 信息**：Switch 切换器（已连接/未连接）+ JTAG 盒子 + JTAG IP
- 编辑完毕点「完成」一次性保存所有字段，点「取消」恢复修改前数据
- Domain Owner 全程只读，只能查看

**芯片绑定逻辑**
- 一颗芯片只能绑定一个平台（通过 `platform_id` 关联）
- 编辑平台时 ASIC ID 下拉展示已绑芯片 + 未绑定芯片，选择后点完成自动绑定
- 切换芯片时旧芯片自动解绑
- 非编辑模式下 ASIC ID 列只显示已绑定的芯片

**Dashboard BU 平台卡片精简**
- 卡片只显示 IP（蓝色加粗）、状态、团队名称（彩色），去除负责人和多余信息

**数据固化与重建**
- `day_allocations` 数据导出为 `server/data/day_allocations_export.json`，不受代码改动影响
- seedData 改为优先从 JSON 文件加载，硬编码 MATRIX 降级为 fallback
- bringup 日期变化时自动重建 `day_allocations` 以匹配新日期范围

**权限细化**
- Domain Owner（`owner` 角色）可以看到所有平台详情但完全只读
- 类型/位置/OS/BMC/JTAG/状态/删除/新增 等编辑功能仅 admin 可见

**默认用户**
- 新增 `iod` 用户（iod/iod123, Domain Owner, 显示名 IOD）

#### Bug 修复
- `PUT /api/teams/day-allocate` 保存失败（UNIQUE 约束不匹配 → 改为 DELETE + INSERT）
- `GET /api/teams/day-allocations` 添加 `Cache-Control: no-store` 防止缓存
- 平台列表页 `chip.platform_id` 查询支持 NULL 值
- 编辑保存后 `_asic_id` 和 `_boundChips` 立即刷新，无需切换页面
- 数据库硬编码 `BR2x6` 已全部改为 `BR288Y`，避免空项目反复出现

---

### v1.0.0 — BR2xx Bringup 平台分配管理 (2026-07-30)

在 v0.5.0 基础上，针对 **BU 阶段** 的 14 天团队-平台矩阵进行重构。

#### 新功能

**团队分配页面全面重构**
- **上下两栏矩阵布局**：上栏为"预分配"矩阵，下栏为"当前活跃"矩阵
- **BU × 14天时间轴**：竖轴为 BU 平台（BU1-BU15），横轴为 Bringup 14 天日期范围
- **格子级分配**：管理员点「编辑分配」进入编辑模式，每个格子下拉框选择团队，选中即永久存储
- **编辑 Bringup 时间**：日历日期选择器选起始日（自动+13天 = 14天），保存后时间轴实时刷新
- **团队颜色标签**：每个团队分配固定色值（18色 + TEAM_COLOR_MAP），格子内显示带颜色的团队名
- **当前活跃矩阵**：展示当天有活跃预约的平台，只读显示

**平台列表页面扩展**
- **11 列合并显示**：平台 / 类型 / ASIC ID / 实验室位置 / 主板 / OS 信息（IP+MAC+用户名密码） / BMC 信息（IP+MAC+用户名密码） / JTAG 信息（编号+IP+MAC） / 预分配团队 / 当前活跃 / 操作
- **类型/实验室位置表格内直接编辑**：admin 可下拉选择（socket/solder_down；三楼/十楼/健康城），非 admin 只读
- **JTAG 条件显示**：仅 `jtag_enabled=true` 时显示 JTAG 行
- **详情弹窗芯片 tab 精简**：4 列（平台 / ASIC ID / 芯片型号 / 编辑/删除操作）
- **预分配团队只读**：移除旧的"编辑预分配团队"对话框，数据由团队分配页面统一管理
- **状态列 admin 保护**：非 admin 看到颜色标签而非下拉框

**权限体系加固**
- 类型/位置/状态下拉框仅 admin 可编辑
- 编辑分配/编辑时间按钮仅 admin 可见
- 新增平台/删除平台按钮仅 admin 可见

**数据持久化**
- 新增 `day_allocations` 表：支持按平台+天+团队的细粒度分配存储
- `platforms.js` 预分配团队查询从 `stage_allocations` 切换为 `day_allocations`
- 三个新 API：`GET/PUT/DELETE /api/teams/day-allocate`
- Bringup 日期从硬编码改为 `system_config` 表存储（`bringup_start`/`bringup_end`）

**杂项改进**
- 项目切换隔离：团队分配/平台列表/芯片信息页面隐藏顶栏项目选择器
- 添加 MBIST 团队和登录用户（mbist/mbist123）
- 日期编辑从周编号（`weekStartDate()`）改为 MM-DD 字符串解析
- App.vue 顶栏项目选择区加 `v-if` 条件显隐

**Bug 修复**
- SQL `LIKE '%BU1%'` 误匹配 BU10/BU11 等问题 → 改为 `','||platforms||',' LIKE '%,BU1,%'`

---

### v0.5.0 — 硬件资源预约平台 初始版本 (2026-07-28)

Bringup FE + FST + PVT 阶段团队-平台分配管理。

#### 功能
- 阶段规划 Gantt 图（按周显示 FE/FST/PVT 各阶段团队分配）
- 平台列表 CRUD：平台创建、编辑配置（IP/位置/主板）、删除
- 团队管理：定义团队名称、颜色、负责人
- 用户管理：创建登录用户，支持 admin / team 角色
- 预约管理：预约/归还平台，状态自动切换
- Dashboard 总览：平台占用统计、各阶段进展
- 芯片信息管理：为每个平台添加/编辑/删除芯片
- 登录验证：基于 localStorage 的用户认证

#### 状态颜色区分
- **Dashboard 阶段卡片**：BU（红）、FE（黄）、FST（蓝）、PVT（绿）
- **平台状态**：空闲（success 绿）、使用中（warning 橙）、维护中（danger 红）
- **预约状态**：活跃中（warning 橙）、已完成（info 灰）
- **角色标签**：管理员（danger 红）、Domain Owner（success 绿）

#### 技术栈
- 前端：Vue 3 + Element Plus
- 后端：Express + better-sqlite3
- 数据库：SQLite

#### 页面结构
- Dashboard.vue — 总览看板
- PlatformView.vue — 平台列表（含新建/编辑/删除/预约）
- TeamView.vue — 团队分配表单（切换阶段 + 粗粒度团队→平台勾选）
- ChipInfo.vue — 芯片信息列表
- GanttView.vue — 阶段规划甘特图

---

## 技术栈

- **前端**：Vue 3 + Element Plus + Vite 8 (Rolldown)
- **后端**：Express + better-sqlite3
- **数据库**：SQLite（单文件 `server/src/data/hardware_reservation.db`）

## 启动

```bash
# 后端（PM2）
pm2 start server/src/index.js --name hardware-reservation

# 前端（开发模式）
cd client && npm run dev

# 前端（生产构建）
cd client && npm run build
```

## 默认用户

| 用户名 | 密码 | 角色 | 显示名 |
|--------|------|------|--------|
| admin | admin123 | 管理员 | 管理员 |
| kobe | kobe123 | 管理员 | Kobe |
| board | board123 | Domain Owner | Board |
| diag | diag123 | Domain Owner | Diag |
| ethernet | ethernet123 | Domain Owner | Ethernet |
| firmware | firmware123 | Domain Owner | Firmware |
| hbm | hbm123 | Domain Owner | HBM |
| jtag | jtag123 | Domain Owner | JTAG |
| kmd | kmd123 | Domain Owner | KMD |
| mbist | mbist123 | Domain Owner | MBIST |
| pcie | pcie123 | Domain Owner | PCIe |
| ppo | ppo123 | Domain Owner | PPO |
| slt | slt123 | Domain Owner | SLT |
| swci | swci123 | Domain Owner | SWCI |
| swmodel | swmodel123 | Domain Owner | SWModel |
| swtool | swtool123 | Domain Owner | SWTOOL |
| ucie | ucie123 | Domain Owner | UCIe |
| umd | umd123 | Domain Owner | UMD |
| video | video123 | Domain Owner | Video |

## 团队分配操作流程

1. admin 登录 → 导航到「团队分配」页面
2. 点击「编辑时间」选择 Bringup 阶段起始日期（自动展示 14 天）
3. 点击「编辑分配」→ 每个格子出现团队下拉框
4. 选择团队 → 格子立即显示颜色标签 + 团队名（实时存入 `day_allocations` 表）
5. 再次点击「退出分配」完成编辑
6. 平台列表页面的「预分配团队」列自动同步（查询 `day_allocations` 聚合结果）

## 数据库表结构

```
platforms              — BU1-BU15 平台
stages                 — BU/FE/FST/PVT 阶段定义
stage_allocations      — v0.5 遗留：粗粒度团队→平台分配（v1.0 仅用于初始导入）
day_allocations        — v1.0 新增：细粒度格子级分配（platform_id + date_stamp + team_id）
reservations           — 预约记录
chips                  — 芯片信息（ASIC ID / 型号等）
teams                  — 团队定义（id / display_name / color / owners）
users                  — 登录用户（name / role / team_id / display_name）
system_config          — 系统配置（current_stage, bringup_start, bringup_end 等）
```

## 页面路由

| 路由 | 页面 | 说明 |
|------|------|------|
| / | Dashboard | 总览看板 |
| /platforms | 平台列表 | 11 列网格，admin 可编辑类型/位置/状态 |
| /teams | 团队分配 | BU × 14 天矩阵，预分配 + 当前活跃 |
| /chips | 芯片信息 | 全平台芯片列表 |
| /gantt | 阶段规划 | v0.5 遗留的甘特图 |