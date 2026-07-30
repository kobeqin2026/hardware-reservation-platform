# 硬件资源预约平台 (Hardware Reservation Platform)

## 版本历史

### v0.5.0 — 硬件资源预约平台 初始版本

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

| 用户名 | 密码 | 角色 | 说明 |
|--------|------|------|------|
| admin | admin123 | 管理员 | 全权限 |
| board | board123 | Domain Owner | 查看+预约 |
| jtag | jtag123 | Domain Owner | 查看+预约 |
| mbist | mbist123 | Domain Owner | 查看+预约 |
| ...各团队名 | {teamId}123 | Domain Owner | 同上 |

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