<template>
  <div class="dashboard">
    <!-- 平台标题 -->
    <div style="text-align:center;margin-bottom:16px;">
      <span style="font-size:22px;font-weight:700;color:#ffffff;">{{ currentProject }} 硬件资源管理平台</span>
    </div>

      <!-- 统计卡片 -->
    <el-row :gutter="12" style="margin-bottom: 12px;">
      <el-col :span="4" v-for="card in statCards" :key="card.label">
        <el-card shadow="never" class="stat-card" :body-style="{padding: '12px'}">
          <div class="stat-value" :style="{color: card.color}">{{ card.value }}</div>
          <div class="stat-label">{{ card.label }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 项目选择与登录栏 -->
    <el-card shadow="never" style="margin-bottom: 16px;">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:8px;">
          <el-switch v-model="autoRefresh" size="small" />
          <span style="font-size:12px;color:#999;">自动刷新</span>
          <span v-if="autoRefresh" style="font-size:12px;color:#4f8cff;font-variant-numeric:tabular-nums;">下次刷新 {{ countdownText }}</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <el-button v-if="canManageReservations" type="success" size="small" @click="openReserveDialog" :icon="Plus">
            新建预约
          </el-button>
          <el-tag v-if="currentUserRef" type="success" size="small" closable @close="handleLogout">
            {{ currentUserRef.name }}
          </el-tag>
        </div>
      </div>
    </el-card>

    <!-- 平台Grid -->
    <el-card shadow="never">
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-weight:600;">BU 平台状态</span>
          <div style="display:flex;gap:12px;align-items:center;">
            <span style="font-size:12px;color:#999;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#67C23A;margin-right:4px;"></span>空闲
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#E6A23C;margin-right:4px;margin-left:8px;"></span>使用中
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#F56C6C;margin-right:4px;margin-left:8px;"></span>维护
              </span>
          </div>
        </div>
      </template>

      <el-row :gutter="12">
        <el-col :span="4" v-for="p in projectPlatforms" :key="p.id" style="margin-bottom:12px;">
          <div
            class="platform-card"
            :class="'status-' + p.status"
            @click="handlePlatformClick(p)"
          >
            <div class="platform-label">{{ p.label }}</div>
            <div class="platform-ip">
              <span v-if="p.config?.ip" class="ip-ssh-link" :title="'点击复制: ssh ' + (p.config.os_user || 'root') + '@' + p.config.ip" @click.stop="copyUserIp(p.config)">{{ p.config.ip }}</span>
              <span v-else>--</span>
            </div>
            <div class="platform-bmc">
              <span class="bmc-label">BMC:</span>
              <a v-if="p.config?.bmc_ip" class="bmc-link" :href="'https://' + p.config.bmc_ip" target="_blank" rel="noopener" @click.stop>{{ p.config.bmc_ip }}</a>
              <span v-else class="bmc-empty">--</span>
            </div>
            <div class="platform-jtag">
              <span class="jtag-label">JTAG:</span>
              <span v-if="p.config?.jtag_box" class="jtag-on" :title="p.config.jtag_ip ? ('JTAG IP: ' + p.config.jtag_ip) : ''">{{ p.config.jtag_box }}<template v-if="p.config.jtag_ip"> · {{ p.config.jtag_ip }}</template></span>
              <span v-else class="jtag-empty">未连接</span>
            </div>
            <div class="platform-status">{{ statusLabel(p.status) }}</div>
            <div class="platform-teams" v-if="p.activeTeams && p.activeTeams.length">
              <div class="team-row" v-for="t in p.activeTeams" :key="t.team_id">
                <span class="team-owner" :style="{color: teamColor(t.team_id)}">{{ t.team_name }}</span>
              </div>
            </div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 当前活跃预约 -->
    <el-card shadow="never" style="margin-top:16px;">
      <template #header>
        <span style="font-weight:600;">当前活跃预约</span>
      </template>
      <el-table :data="activeReservations" stripe size="small" v-if="activeReservations.length">
        <el-table-column prop="platform_label" label="平台" width="72" />
        <el-table-column prop="team_name" label="团队" width="110" />
        <el-table-column prop="owner" label="负责人" width="80" />
        <el-table-column prop="purpose" label="用途" min-width="180" />
        <el-table-column prop="started_at" label="开始时间" width="150" />
        <el-table-column label="操作" width="100">
          <template #default="{row}">
            <el-button v-if="canReleaseReservation(row)" type="danger" size="small" @click="handleRelease(row)" :disabled="row._noReservation">{{ row._noReservation ? '无预约' : '释放' }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="暂无活跃预约" :image-size="80" />
    </el-card>

    <!-- 预约平台历史记录 -->
    <el-card shadow="never" style="margin-top:16px;">
      <template #header>
        <span style="font-weight:600;">预约平台历史记录</span>
      </template>
      <template v-if="reservationHistory.length">
      <el-table :data="pagedHistory" stripe size="small">
        <el-table-column prop="platform_label" label="平台" width="72" />
        <el-table-column prop="team_name" label="团队" width="110" />
        <el-table-column prop="owner" label="负责人" width="80" />
        <el-table-column prop="purpose" label="用途" min-width="160" show-overflow-tooltip />
        <el-table-column prop="started_at" label="新建预约时间" width="160" />
        <el-table-column label="释放预约时间" width="160">
          <template #default="{row}">
            <span v-if="row.ended_at">{{ row.ended_at }}</span>
            <span v-else-if="row.status==='active'" style="color:#E6A23C;">使用中</span>
            <span v-else style="color:#999;">—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{row}">
            <el-tag :type="row.status==='active' ? 'warning' : 'success'" size="small">{{ row.status==='active' ? '使用中' : '已释放' }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="reservationHistory.length > HISTORY_PAGE_SIZE" style="display:flex;justify-content:flex-end;margin-top:12px;">
        <el-pagination
          v-model:current-page="historyPage"
          :total="reservationHistory.length"
          :page-size="HISTORY_PAGE_SIZE"
          layout="total, prev, pager, next"
          small
        />
      </div>
      </template>
      <el-empty v-else description="暂无预约历史" :image-size="80" />
    </el-card>

    <!-- 各团队平台状态 -->
    <el-card shadow="never" style="margin-top:16px;">
      <template #header>
        <span style="font-weight:600;">各团队平台状态</span>
      </template>
      <template v-if="teamPlatformStats.length">
      <el-table :data="teamPlatformStats" stripe size="small">
        <el-table-column label="团队" width="130">
          <template #default="{row}">
            <span :style="{color: teamColor(row.team_name.toLowerCase()), fontWeight: 600}">{{ row.team_name }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="total" label="占用" width="64" align="center" sortable />
        <el-table-column label="占用平台" min-width="220">
          <template #default="{row}">
            <span v-if="row.platforms && row.platforms.length" style="font-size:12px;color:#666;">
              {{ row.platforms.join('、') }}
            </span>
            <span v-else style="color:#999;font-size:12px;">--</span>
          </template>
        </el-table-column>
      </el-table>
      <div style="margin-top:12px;padding:8px 12px;background:#1d2436;border:1px solid #2a3350;border-radius:4px;font-size:12px;color:#ffc53d;line-height:1.5;">
        <strong>建议：</strong>平台使用者在预约之后请修改默认密码，以防被误用；释放之后恢复默认。
      </div>
    </template>
    <el-empty v-else description="暂无平台数据" :image-size="60" />
    </el-card>

    <!-- 新建预约对话框 -->
    <el-dialog v-model="showReserveDialog" title="新建预约" width="500px">
      <el-form :model="reserveForm" label-width="80px">
        <el-form-item label="团队">
          <el-select v-model="reserveForm.teamId" style="width:100%" placeholder="选择团队" :disabled="isOwner">
            <el-option v-for="t in allTeams" :key="t.id" :label="t.display_name" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="平台">
          <el-select v-model="reserveForm.platformId" filterable style="width:100%" placeholder="选择平台">
            <el-option v-for="p in reservePlatforms" :key="p.id" :label="p.label" :value="p.id" :disabled="p.status==='maintenance'" />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-input :model-value="reserveTeamOwner" disabled placeholder="自动获取" />
        </el-form-item>
        <el-form-item label="用途">
          <el-input v-model="reserveForm.purpose" type="textarea" :rows="2" placeholder="测试用途描述" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showReserveDialog = false">取消</el-button>
        <el-button type="primary" @click="handleReserve" :loading="reserving">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, inject, onBeforeUnmount } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getOverview, getStats, getStages, switchStage,
  getPlatforms, reservePlatform, releaseReservation, getLogs, getReservationHistory
} from '@/api'

const currentProject = inject('currentProject', ref(''))

/** 剪贴板写入：clipboard API 优先，非 https 回退 execCommand */
function copyText(text, msg) {
  const done = () => ElMessage.success(msg || `已复制: ${text}`)
  const fallback = () => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch (e) {}
    document.body.removeChild(ta)
    done()
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => { fallback() })
  } else {
    fallback()
  }
}

/** 点击 IP：复制完整 SSH 命令 `ssh user@ip`（如 ssh user@10.0.0.11），粘贴到 MobaXterm 快速连接 / 终端直接发起连接 */
function copyUserIp(cfg) {
  const c = cfg || {}
  const user = c.os_user || 'root'
  const ip = c.ip
  if (!ip) return ElMessage.warning('该平台没有 IP')
  copyText(`ssh ${user}@${ip}`)
}

// 从 localStorage 获取当前登录用户
function getCurrentUser() {
  try {
    const s = localStorage.getItem('hw_reservation_user')
    return s ? JSON.parse(s) : null
  } catch { return null }
}

const platforms = ref([])
const activeReservations = ref([])
const reservationHistory = ref([])
// 历史记录分页: 每页固定 10 条, 其余翻页显示
const HISTORY_PAGE_SIZE = 10
const historyPage = ref(1)
const pagedHistory = computed(() => {
  const start = (historyPage.value - 1) * HISTORY_PAGE_SIZE
  return reservationHistory.value.slice(start, start + HISTORY_PAGE_SIZE)
})
const stages = ref([])
const currentStage = ref('BU')
const allTeams = ref([])
const allPlatforms = ref([])
const stats = ref({})
const showReserveDialog = ref(false)
const reserving = ref(false)
const currentUserRef = ref(getCurrentUser())
// 角色判定: admin 全量, owner(domain owner) 可预约/释放本团队已预分配的平台(后端按 day_allocations 鉴权)
const currentRole = computed(() => { try { const u = JSON.parse(localStorage.getItem('hw_reservation_user') || 'null'); return u ? u.role : '' } catch (e) { return '' } })
const isAdmin = computed(() => currentRole.value === 'admin')
const isOwner = computed(() => currentRole.value === 'owner')
// 可管理预约(新建/释放): admin 或 owner; 后端对 owner 只放行本团队已预分配平台
const canManageReservations = computed(() => isAdmin.value || isOwner.value)
// 当前登录用户名 (owner 账号名=团队id, 用于 owner 只显示/可释放自己团队预约; 实时读 localStorage 防 SSO 后不更新)
const currentUserName = computed(() => {
  try { const u = JSON.parse(localStorage.getItem('hw_reservation_user') || 'null'); return u ? (u.name || '') : '' } catch (e) { return '' }
})
// owner 是否可释放某条预约: admin 恒可; owner 只能释放本团队(team_id===自己账号名)的预约
const canReleaseReservation = computed(() => (row) => {
  if (isAdmin.value) return true
  return isOwner.value && row.team_id === currentUserName.value
})

// 统一团队色卡（与 TeamView.vue 预分配保持一致）
const TEAM_COLOR_MAP = {
  hbm: '#F97316', ucie: '#84CC16', jtag: '#0891B2', swtool: '#0369A1',
  board: '#DC2626', diag: '#2563EB', ethernet: '#16A34A', firmware: '#D97706',
  kmd: '#CA8A04', mbist: '#DB2777', pcie: '#0E7490', ppo: '#65A30D',
  slt: '#A21CAF', swci: '#0D9488', swmodel: '#BE185D', umd: '#15803D',
  video: '#B45309', dft: '#7C3AED', npival: '#4F46E5', computelib: '#0EA5E9',
}

function teamColor(teamId) {
  return TEAM_COLOR_MAP[teamId] || '#409EFF'
}

const reserveForm = reactive({
  teamId: '',
  platformId: '',
  owner: '',
  purpose: ''
})

// 负责人跟随所选团队自动填充
const reserveTeamOwner = computed(() => {
  if (!reserveForm.teamId) return ''
  const team = allTeams.value.find(t => t.id === reserveForm.teamId)
  return team ? (team.owners || team.id || '').split(',')[0] : reserveForm.teamId
})

const statCards = computed(() => [
  { label: '平台总数', value: stats.value.totalPlatforms || 0, color: '#409EFF' },
  { label: '使用中', value: stats.value.inUse || 0, color: '#E6A23C' },
  { label: '空闲', value: stats.value.idle || 0, color: '#67C23A' },
  { label: '维护中', value: stats.value.maintenance || 0, color: '#F56C6C' },
  
  { label: '活跃团队', value: stats.value.activeTeams || 0, color: '#E040FB' },
  { label: '活跃预约', value: stats.value.activeReservations || 0, color: '#FF9800' },
])


/** 按团队列出当前项目下各团队占用平台的状态分布 */
const teamPlatformStats = computed(() => {
  const teams = allTeams.value
  const plats = projectPlatforms.value
  if (!teams || !teams.length) return []

  return (
    teams
      .map(t => {
        // 该团队在当前项目中实际占用的平台（有活跃预约的）
        const myPlatforms = plats.filter(p =>
          (p.activeTeams || []).some(at => at.team_id === t.id)
        )
        const platNames = myPlatforms.map(p => p.label).sort()
        return {
          team_name: t.display_name,
          team_color: teamColor(t.id),
          total: myPlatforms.length,
          platforms: platNames
        }
      })
      .sort((a, b) => b.total - a.total)
  )
})

/** 根据 currentStage ID 获取显示名称 */
const currentStageName = computed(() => {
  const s = stages.value.find(st => st.id === currentStage.value)
  return s ? s.name : currentStage.value
})

function statusLabel(st) {
  const map = { idle: '空闲', in_use: '使用中', maintenance: '维护中' }
  return map[st] || st
}

// 从 day_allocations 查询当天该平台的预分配团队
function getTeamFromDayAlloc(platformId) {
  const today = new Date()
  const ts = new Date(2026, today.getMonth(), today.getDate()).getTime()
  const row = dayAllocCache.value.find(r => r.platform_id === platformId && r.date_stamp === ts)
  return row ? row.team_id : '-'
}
const dayAllocCache = ref([])

async function loadAll() {
  try {
    // 先加载 day_allocations 缓存
    try { dayAllocCache.value = await fetch('/api/teams/day-allocations').then(r=>r.json()) } catch(e) {}

    const [overviewRes, statsRes, stageRes, platformRes, historyRes] = await Promise.all([
      getOverview(), getStats({ project: currentProject.value }), getStages(), getPlatforms(), getReservationHistory(currentProject.value)
    ])

    const ov = overviewRes.data
    activeReservations.value = ov.activeReservations || []
    reservationHistory.value = historyRes.data?.items || []
    historyPage.value = 1
    const inUsePlats = platformRes.data.platforms.filter(p => p.status === 'in_use' && !ov.activeReservations?.some(r => r.platform_id === p.id))
    for (const p of inUsePlats) {
      const activeTeam = p.activeTeams?.[0]
      activeReservations.value.push({
        platform_id: p.id,
        platform_label: p.label,
        team_name: activeTeam?.team_name || getTeamFromDayAlloc(p.id),
        team_id: activeTeam?.team_id || '-',
        owner: activeTeam?.owner || '-',
        purpose: '使用中' + (activeTeam ? '' : '（团队信息缺失）'),
        started_at: '',
        _noReservation: !activeTeam
      })
    }
    allTeams.value = ov.teams || []
    allPlatforms.value = ov.platforms || []

    // 使用 getPlatforms() 的完整数据（含 activeTeams、config 等）
    platforms.value = platformRes.data.platforms || (ov.platforms || [])

    stats.value = statsRes.data
    stages.value = stageRes.data.stages
    currentStage.value = stageRes.data.currentStage

    // 也获取当前阶段的分配信息
    if (!platforms.value || platforms.value.length === 0) {
      const platformRes2 = await getPlatforms()
      platforms.value = platformRes2.data.platforms || []
    }
  } catch(e) {
    ElMessage.error('加载数据失败：' + (e.response?.data?.error || e.message))
  }
}

// ---- 计算当前项目下的平台 ----
const projectPlatforms = computed(() => {
  return platforms.value
    .filter(p => (p.project || '') === currentProject.value)
    .sort((a, b) => {
      const na = parseInt((a.label || a.id || '').replace(/.*?BU/gi, '').replace(/[^0-9]/g, '') || '0', 10)
      const nb = parseInt((b.label || b.id || '').replace(/.*?BU/gi, '').replace(/[^0-9]/g, '') || '0', 10)
      return na - nb
    })
})

// ---- 每团队可预约的平台(去重自 day_allocations) — owner 用它过滤平台下拉, 避免点到未预分配平台 403 ----
const teamReservablePlatforms = computed(() => {
  const map = {}
  for (const row of (dayAllocCache.value || [])) {
    if (!row || !row.team_id || !row.platform_id) continue
    if (!map[row.team_id]) map[row.team_id] = new Set()
    map[row.team_id].add(row.platform_id)
  }
  return map
})

// 平台是否有团队信息 —— 无团队信息不可预约(2026-09-28)
// (2026-10-02 修复: 共享平台判定) 除预分配(day_allocations/allocatedTeams)外,
// 平台有活跃预约(activeTeams, 正被其他团队共享使用) 同样视为"有团队信息"可预约,
// 否则 in_use 但无 day_allocations 的共享平台被误判"无团队信息"而筛掉(如 BU15 被 jtag/board 共享).
function platformHasTeamInfo(p) {
  if (p.allocatedTeams && p.allocatedTeams.length) return true
  if (p.activeTeams && p.activeTeams.length) return true
  return (dayAllocCache.value || []).some(r => r.platform_id === p.id)
}

// 新建预约平台下拉:
//  - owner(domain owner) 暂时不受预分配限制(2026-09-28): 显示全部平台(维护中由 el-option 置灰)
//  - 其余角色: 显示有团队信息(已预分配)的平台 + 空闲平台(2026-10-01: 空闲=真正空闲, 随时可预约)
const reservePlatforms = computed(() => {
  if (isOwner.value) return projectPlatforms.value
  return projectPlatforms.value.filter(p => p.status === 'idle' || platformHasTeamInfo(p))
})

/** 项目切换 */
function handleProjectSwitch(project) {
  currentProject.value = project
  ElMessage.info(`已切换到 ${project} 项目`)
  // reload data
  loadAll()
}

async function handleSwitchStage(stageId) {
  try {
    await switchStage(stageId)
    ElMessage.success(`已切换到 ${stageId} 阶段`)
    await loadAll()
  } catch(e) {
    ElMessage.error('切换失败')
  }
}

function handlePlatformClick(p) {
  // 可扩展为跳转到平台详情
}

async function openReserveDialog() {
  reserveForm.teamId = ''
  reserveForm.platformId = ''
  reserveForm.purpose = ''
  reserveForm.owner = ''
  // 根据登录用户名自动匹配团队（用户名=团队ID），匹配不到则为空手动选择；owner 锁定本团队
  const cu = currentUserRef.value
  if (cu && cu.name) {
    const team = allTeams.value.find(t => t.id === cu.name)
    reserveForm.teamId = team ? team.id : (isOwner.value ? cu.name : '')
  }
  showReserveDialog.value = true
}

async function handleReserve() {
  if (!reserveForm.teamId || !reserveForm.platformId) {
    ElMessage.warning('请选择团队和平台')
    return
  }
  reserving.value = true
  try {
    // 自动从选中的团队取负责人
    const team = allTeams.value.find(t => t.id === reserveForm.teamId)
    const owner = team ? (team.owners || '').split(',')[0] : reserveForm.teamId
    await reservePlatform(reserveForm.teamId, reserveForm.platformId, reserveForm.purpose, owner)
    ElMessage.success('预约成功')
    showReserveDialog.value = false
    reserveForm.teamId = ''
    reserveForm.platformId = ''
    reserveForm.purpose = ''
    reserveForm.owner = ''
    await loadAll()
  } catch(e) {
    ElMessage.error('预约失败：' + (e.response?.data?.error || e.message))
  } finally {
    reserving.value = false
  }
}

async function handleRelease(row) {
  try {
    await ElMessageBox.confirm(`确定释放 ${row.platform_label} ？`, '确认')
    await releaseReservation(row.id)
    ElMessage.success('已释放')
    await loadAll()
  } catch(e) {
    if (e !== 'cancel') ElMessage.error('释放失败')
  }
}

onMounted(loadAll)

// ---- 自动刷新（间隔5分钟）+ 刷新倒计时 ----
const AUTO_REFRESH_INTERVAL = 300 // 秒
const autoRefresh = ref(true)
const countdown = ref(AUTO_REFRESH_INTERVAL)
let autoTimer = null
function tickAutoRefresh() {
  if (!autoRefresh.value) return
  countdown.value = countdown.value - 1
  if (countdown.value <= 0) {
    loadAll()
    countdown.value = AUTO_REFRESH_INTERVAL
  }
}
onMounted(() => { autoTimer = setInterval(tickAutoRefresh, 1000) })
onBeforeUnmount(() => { if (autoTimer) { clearInterval(autoTimer); autoTimer = null } })
const countdownText = computed(() => {
  const s = Math.max(0, countdown.value)
  const m = Math.floor(s / 60)
  const ss = s % 60
  return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0')
})

// 监听项目切换事件
if (typeof window !== 'undefined') {
  window.addEventListener('project-changed', () => { loadAll() })
}
</script>

<style scoped>
.stat-card { text-align: center; cursor: default; border-radius: 6px; transition: transform .2s; }
.stat-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.stat-value { font-size: 24px; font-weight: 700; line-height: 1.2; }
.stat-label { font-size: 11px; color: #999; margin-top: 3px; }

.platform-card {
  border: 1px solid #2a3350;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all .2s;
  background: #171d2b;
  min-height: 120px;
  display: flex;
  flex-direction: column;
}
.platform-card:hover {
  box-shadow: 0 8px 30px rgba(0,0,0,.35);
  transform: translateY(-2px);
}
.platform-card.status-idle { border-left: 4px solid #67C23A; }
.platform-card.status-in_use { border-left: 4px solid #E6A23C; }
.platform-card.status-maintenance { border-left: 4px solid #F56C6C; background: #fef0f0; }
.platform-card.status-backup { border-left: 4px solid #909399; background: #f5f7fa; }
/* ft_reserved no longer used */

.platform-label { font-size: 20px; font-weight: 700; }
.platform-ip { font-size: 14px; color: #409EFF; font-weight: 700; margin-top: 1px; line-height: 1.3; }
.ip-ssh-link { font-family: monospace; color: #409EFF; text-decoration: underline; cursor: pointer; }
.ip-ssh-link:hover { color: #79bbff; }
.platform-bmc { display: flex; align-items: center; gap: 4px; margin-top: 1px; line-height: 1.3; }
.bmc-label { font-size: 11px; color: #999; flex-shrink: 0; }
.bmc-link { font-size: 12px; font-family: monospace; font-weight: 600; color: #409EFF; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bmc-link:hover { text-decoration: underline; }
.bmc-empty { font-size: 12px; color: #c0c4cc; }
.platform-jtag { display: flex; align-items: center; gap: 4px; margin-top: 1px; line-height: 1.3; }
.jtag-label { font-size: 11px; color: #999; flex-shrink: 0; }
.jtag-on { font-size: 12px; font-family: monospace; font-weight: 600; color: #409EFF; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jtag-empty { font-size: 12px; color: #c0c4cc; }
.platform-status { font-size: 11px; color: #999; margin-top: 2px; }
.platform-teams { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 2px; flex-direction: column; }
.team-row { display: flex; align-items: center; gap: 4px; font-size: 11px; line-height: 1.4; }
.team-owner { font-weight: 600; font-size: 12px; }
.owner-name { color: #999; font-size: 10px; margin-left: 2px; }
</style>