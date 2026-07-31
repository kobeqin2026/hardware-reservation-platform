<template>
  <div class="dashboard">
    <!-- 平台标题 -->
    <div style="text-align:center;margin-bottom:16px;">
      <span style="font-size:22px;font-weight:700;color:#303133;">{{ currentProject }} 硬件资源预约平台</span>
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
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <el-button type="success" size="small" @click="openReserveDialog" :icon="Plus">
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
            <div class="platform-ip">{{ p.config?.ip || '--' }}</div>
            <div class="platform-status">{{ statusLabel(p.status) }}</div>
            <div class="platform-teams" v-if="p.activeTeams && p.activeTeams.length">
              <div class="team-row" v-for="t in p.activeTeams" :key="t.team_id">
                <span class="team-owner" :style="{color: t.team_color}">{{ t.team_name }}</span>
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
            <el-button type="danger" size="small" @click="handleRelease(row)" :disabled="row._noReservation">{{ row._noReservation ? '无预约' : '释放' }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="暂无活跃预约" :image-size="80" />
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
            <span :style="{color: row.team_color, fontWeight: 600}">{{ row.team_name }}</span>
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
      <div style="margin-top:12px;padding:8px 12px;background:#fefce8;border-radius:4px;font-size:12px;color:#92400e;line-height:1.5;">
        <strong>建议：</strong>平台使用者在预约之后更改平台密码，以防被误用；释放之后将密码改回默认密码。
      </div>
    </template>
    <el-empty v-else description="暂无平台数据" :image-size="60" />
    </el-card>

    <!-- 新建预约对话框 -->
    <el-dialog v-model="showReserveDialog" title="新建预约" width="500px">
      <el-form :model="reserveForm" label-width="80px">
        <el-form-item label="团队">
          <el-select v-model="reserveForm.teamId" disabled style="width:100%">
            <el-option v-for="t in allTeams" :key="t.id" :label="t.display_name" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="平台">
          <el-select v-model="reserveForm.platformId" filterable style="width:100%" placeholder="选择平台">
            <el-option v-for="p in allPlatforms" :key="p.id" :label="p.label" :value="p.id" :disabled="p.status==='maintenance'" />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-input :model-value="currentUserRef ? currentUserRef.name : ''" disabled placeholder="自动获取" />
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
import { ref, reactive, computed, onMounted, inject } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getOverview, getStats, getStages, switchStage,
  getPlatforms, reservePlatform, releaseReservation, getLogs
} from '@/api'

const currentProject = inject('currentProject', ref('BR2x6'))

// 从 localStorage 获取当前登录用户
function getCurrentUser() {
  try {
    const s = localStorage.getItem('hw_reservation_user')
    return s ? JSON.parse(s) : null
  } catch { return null }
}

const platforms = ref([])
const activeReservations = ref([])
const stages = ref([])
const currentStage = ref('BU')
const allTeams = ref([])
const allPlatforms = ref([])
const stats = ref({})
const showReserveDialog = ref(false)
const reserving = ref(false)
const currentUserRef = ref(getCurrentUser())

const reserveForm = reactive({
  teamId: '',
  platformId: '',
  owner: '',
  purpose: ''
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
          team_color: t.color || '#409EFF',
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

    const [overviewRes, statsRes, stageRes, platformRes] = await Promise.all([
      getOverview(), getStats({ project: currentProject.value }), getStages(), getPlatforms()
    ])

    const ov = overviewRes.data
    activeReservations.value = ov.activeReservations || []
    // 补充 status=in_use 但没有 reservation 的平台
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
    .filter(p => (p.project || 'BR2x6') === currentProject.value)
    .sort((a, b) => {
      const na = parseInt((a.label || a.id || '').replace(/.*?BU/gi, '').replace(/[^0-9]/g, '') || '0', 10)
      const nb = parseInt((b.label || b.id || '').replace(/.*?BU/gi, '').replace(/[^0-9]/g, '') || '0', 10)
      return na - nb
    })
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

function openReserveDialog() {
  reserveForm.platformId = ''
  reserveForm.purpose = ''
  // 从当前登录用户自动获取负责人和团队
  const cu = currentUserRef.value
  reserveForm.owner = cu?.name || ''
  // 根据登录用户名自动匹配团队（用户名=团队ID）
  if (cu && cu.name) {
    const team = allTeams.value.find(t => t.id === cu.name)
    reserveForm.teamId = team ? team.id : ''
  } else {
    reserveForm.teamId = ''
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
    await reservePlatform(reserveForm.teamId, reserveForm.platformId, reserveForm.purpose, reserveForm.owner)
    ElMessage.success('预约成功')
    showReserveDialog.value = false
    reserveForm.teamId = ''
    reserveForm.platformId = ''
    reserveForm.purpose = ''
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
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all .2s;
  background: #fff;
  height: 120px;
  display: flex;
  flex-direction: column;
}
.platform-card:hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  transform: translateY(-2px);
}
.platform-card.status-idle { border-left: 4px solid #67C23A; }
.platform-card.status-in_use { border-left: 4px solid #E6A23C; }
.platform-card.status-maintenance { border-left: 4px solid #F56C6C; background: #fef0f0; }
.platform-card.status-backup { border-left: 4px solid #909399; background: #f5f7fa; }
/* ft_reserved no longer used */

.platform-label { font-size: 20px; font-weight: 700; }
.platform-ip { font-size: 14px; color: #409EFF; font-weight: 700; margin-top: 1px; line-height: 1.3; }
.platform-status { font-size: 11px; color: #999; margin-top: 2px; }
.platform-teams { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 2px; flex-direction: column; }
.team-row { display: flex; align-items: center; gap: 4px; font-size: 11px; line-height: 1.4; }
.team-owner { font-weight: 600; font-size: 12px; }
.owner-name { color: #999; font-size: 10px; margin-left: 2px; }
</style>