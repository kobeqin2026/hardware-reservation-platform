# 硬件资源预约平台 (Hardware Reservation Platform)

> 系统地址：http://10.49.5.188:3002/

## 概述

硬件资源预约平台是一个面向 GPU Bringup 团队的硬件平台管理与预约系统。支持多项目管理、团队-平台分配、芯片绑定、预约管理等核心功能。

**当前项目**: BR288Y | **阶段**: BU (Bring Up) | **平台**: BU1-BU15

---

## 核心功能

### 1. 项目切换与管理

- 登录后多项目时自动弹出项目选择卡片，选项目才能进入
- 顶栏项目选择器可随时切换项目，所有页面数据自动刷新
- 新建项目支持两种方式：
  - **从已有项目复制**：复制来源项目所有平台和配置
  - **空白创建**：创建空项目，手动添加平台

### 2. 总览看板 (Dashboard)

- 统计卡片：平台总数、使用中、空闲、维护中、活跃团队、活跃预约
- BU 平台状态卡片网格：每个平台显示 BU 编号、IP 地址、状态、当前占用团队名称
- 当前活跃预约列表
- 各团队平台状态统计表

### 3. 平台列表 (Platform Management)

- 15 列完整信息展示：平台 / 类型 / ASIC ID / 实验室位置 / 主板 / OS 信息 / BMC 信息 / JTAG 信息 / 预分配团队 / 当前活跃 / 操作
- **admin 行内编辑模式**：点击操作列「编辑」按钮，整行进入编辑状态
  - 类型：Socket / Solder Down 下拉选择
  - 实验室位置：三楼 / 十楼 / 健康城 下拉选择
  - ASIC ID：从芯片数据下拉选择，自动绑定芯片到平台（一颗芯片只能绑定一个平台）
  - 主板：输入框
  - OS 信息：IP、操作系统、用户、密码
  - BMC 信息：BMC IP、用户、密码
  - JTAG 信息：Switch 切换（已连接/未连接）+ JTAG 盒子 + JTAG IP
  - 编辑完毕点「完成」一次性保存，点「取消」恢复
- **状态管理**：空闲 / 使用中 / 维护中 下拉切换
- **快速预约**：选择团队 + 负责人 + 用途进行预约
- **详情弹窗**：基本信息、芯片信息、预约记录、操作日志

### 4. 芯片信息管理 (Chip Info)

- 所有平台芯片统一管理
- 每个芯片：槽位、序列号、ASIC ID、型号、状态、备注
- 一颗芯片只能绑定一个平台（platform_id 关联）
- 按项目过滤显示

### 5. 团队分配 (Team Allocation)

- **BU × 14 天矩阵**：竖轴 BU1-BU15 平台，横轴 14 天时间轴
- **上栏 - 预分配**：管理员可编辑每个格子的团队分配
- **下栏 - 当前活跃**：展示当天活跃预约的平台
- **编辑 Bringup 时间**：日历选择起始日期自动 +13 天
- **团队颜色标签**：每个团队有固定色值，格子内彩色显示
- 支持 bringup 日期变化时自动重建分配数据

### 6. 阶段规划 (Stage Plan)

- BU / FE / FST / PVT 四个阶段甘特图视图
- 各阶段团队-平台分配概览
- 阶段切换与对比

### 7. 操作日志 (Logs)

- 记录所有用户操作：登录、登出、配置修改、预约、状态变更等
- 按日期筛选查看

---

## 用户角色

| 角色 | 权限 |
|------|------|
| **管理员 (admin)** | 全部权限：编辑配置、管理用户、删除平台、状态切换、预约 |
| **Domain Owner (owner)** | 只读查看所有平台详情，不可编辑 |

### 默认用户

| 用户名 | 密码 | 角色 | 显示名 |
|--------|------|------|--------|
| admin | admin123 | 管理员 | 管理员 |
| kobe | kobe123 | 管理员 | Kobe |
| iod | iod123 | Domain Owner | IODie |
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

---

## 团队列表

| 团队 ID | 显示名 | 颜色 |
|---------|--------|------|
| board | Board | #F44336 |
| firmware | Firmware | #FF9800 |
| diag | Diag | #FFC107 |
| jtag | JTAG | #4CAF50 |
| ethernet | Ethernet | #009688 |
| pcie | PCIe | #2196F3 |
| hbm | HBM | #3F51B5 |
| ucie | UCIe | #9C27B0 |
| slt | SLT | #E91E63 |
| ppo | PPO | #795548 |
| mbist | MBIST | #FF6F00 |
| swci | SWCI | #607D8B |
| swmodel | SWModel | #00BCD4 |
| swtool | SWTOOL | #8BC34A |
| kmd | KMD | #CDDC39 |
| umd | UMD | #FF5722 |
| video | Video | #E040FB |
| iod | IOD | #FF9800 |

---

## 技术栈

- **前端**: Vue 3 + Element Plus + Vite 8 (Rolldown)
- **后端**: Express + better-sqlite3
- **数据库**: SQLite（单文件）
- **部署**: PM2 进程管理
- **数据固化**: day_allocations 导出为 JSON 文件，不受代码改动影响

## 页面路由

| 路由 | 页面 | 说明 |
|------|------|------|
| / | Dashboard | 总览看板 |
| /platforms | 平台列表 | admin 可编辑配置 / 状态 / 芯片绑定 |
| /teams | 团队分配 | BU × 14 天矩阵，预分配 + 当前活跃 |
| /chips | 芯片信息 | 全平台芯片列表 |
| /stage-plan | 阶段规划 | BU/FE/FST/PVT 甘特图 |
| /logs | 操作日志 | 用户操作记录 |

---

## 数据固化

- `day_allocations` 预分配数据固化到 `server/data/day_allocations_export.json`
- bringup 日期变化时自动重建分配数据
- Seed 数据优先从 JSON 文件加载，硬编码 MATRIX 降级为 fallback

## 版本

当前版本: **v1.0.5** — 平台配置行内编辑 + 芯片绑定 + 项目切换 + 数据固化