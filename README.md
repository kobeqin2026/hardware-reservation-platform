# 硬件资源预约平台 (Hardware Reservation Platform)

Bringup BU 阶段 14 天团队-平台分配管理系统。

## 版本历史

### v1.0.0 — BR2xx Bringup 平台分配管理 (2026-07-30)

相对于 v0.5.0 的完整改动：

#### 新功能
- **团队分配矩阵**：上下两栏矩阵视图（预分配 + 当前活跃），竖轴为 BU 平台（BU1-BU15），横轴为 14 天时间轴
- **格子级分配**：管理员可逐格选择团队，按天+平台细粒度永久存储（`day_allocations` 表）
- **编辑 Bringup 时间**：日历日期选择器，选起始日自动 14 天，保存后时间轴实时刷新
- **平台列表全面改版**：11 列合并显示（平台 / 类型 / ASIC ID / 实验室位置 / 主板 / OS 信息 / BMC 信息 / JTAG 信息 / 预分配团队 / 当前活跃 / 操作）
- **类型/实验室位置下拉框**：表格内直接编辑（socket/solder_down；三楼/十楼/健康城）
- **JTAG 条件显示**：仅 `jtag_enabled=true` 时显示 JTAG 编号 + IP + MAC
- **团队颜色系统**：18 色调色板 + 显式 TEAM_COLOR_MAP（hbm 橙、ucie 荧光绿、jtag 青等），一眼区分
- **芯片详情**：详情弹窗芯片 tab 精简为 4 列（平台、ASIC ID、芯片型号、操作）
- **Bringup 日期持久化**：`system_config` 表存储 `bringup_start`/`bringup_end`，不再依赖周编号
- **项目切换隔离**：团队分配/平台列表/芯片信息页面隐藏顶部项目选择栏
- **管理权限守卫**：类型、位置、状态、编辑分配、编辑时间均为 admin only
- **MBIST 团队/用户**：新增 mbist 用户（mbist/mbist123）

#### 架构变更
- 新增 `day_allocations` 表支持逐格精度的分配持久化
- `platforms.js` 预分配团队查询从 `stage_allocations`（粗粒度）切换为 `day_allocations`（细粒度）
- `teams.js` 新增三个 API：`GET/PUT/DELETE /day-allocate`
- `stages.js` 新增 `bringupStart`/`bringupEnd` 字段读写
- 移除平台列表的"编辑预分配团队"对话框（数据由团队分配页面管理）
- App.vue 顶栏项目选择区加 `v-if` 条件显隐

#### Bug 修复
- SQL `LIKE '%BU1%'` 误匹配 BU10/BU11 → 改为 `','||platforms||',' LIKE '%,BU1,%'`
- 日期编辑弹窗中 `dayRange` 不一致问题 → 统一使用 `editDays`/`tmpDates` ref
- `dayRange` 从 `weekStartDate()` 硬编码改为 MM-DD 字符串解析
- Rolldown tree-shaker 误删 setup 变量 → 回退为内联模板 + ref 直接绑定

### v0.5.0 — 初始版本

- 基础平台 CRUD
- 简单团队分配（`stage_allocations` 表）
- 阶段规划 Gantt 图
- 芯片信息管理
- Dashboard 总览看板
- 登录/用户系统

---

## 技术栈

- **前端**：Vue 3 + Element Plus + Vite 8
- **后端**：Express + better-sqlite3
- **数据库**：SQLite（单文件 `server/src/data/hardware_reservation.db`）

## 启动

```bash
# 后端
node server/src/index.js          # PM2: pm2 start server/src/index.js --name hardware-reservation

# 前端（开发）
cd client && npm run dev

# 前端（构建）
cd client && npm run build         # 构建后静态文件由 Express 自动伺服
```

## 默认用户

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 管理员 |
| board | board123 | Domain Owner |
| jtag | jtag123 | Domain Owner |
| mbist | mbist123 | Domain Owner |
| ...各团队名 | {teamId}123 | Domain Owner |

## 团队分配操作流程

1. 管理员登录 → 进入"团队分配"页面
2. 点击「编辑时间」选择 BU 阶段的起始日期（自动14天）
3. 点击「编辑分配」→ 格子里出现下拉框 → 选择团队
4. 选中的格子立即保存，颜色标签显示团队名
5. 再次点击「退出分配」完成编辑
6. 平台列表的「预分配团队」列自动同步显示该平台被分配的团队

## 数据库结构

```
platforms        — BU1-BU15 平台
stages           — BU/FE/FST/PVT 阶段  
stage_allocations — 粗粒度团队→平台分配（仅用于初始导入）
day_allocations  — 细粒度格子级分配（platform_id + date_stamp + team_id）
reservations     — 预约记录
chips            — 芯片信息
teams            — 团队定义
users            — 登录用户
system_config    — 系统配置（current_stage, bringup_start/end 等）
```