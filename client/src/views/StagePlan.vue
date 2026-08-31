<template>
  <div class="stage-plan">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <span style="font-size:16px;font-weight:700;">{{ currentProject }} — 阶段规划</span>
      <div style="display:flex;gap:8px;">
        <el-button size="small" @click="loadData" :icon="Refresh">刷新</el-button>
        <el-button v-if="isAdmin" size="small" type="primary" @click="openTimeEdit" :icon="Edit">编辑时间</el-button>
      </div>
    </div>

    <!-- 时间轴概览 -->
    <el-card shadow="never">
      <template #header>
        <span style="font-weight:600;">阶段时间规划</span>
      </template>

      <!-- Gantt 时间线 -->
      <div class="gantt-container">
        <!-- 时间轴头部：年份（合并显示） -->
        <div class="gantt-header">
          <div class="gantt-row-label"></div>
          <div class="gantt-weeks">
            <div
              v-for="yr in yearRanges"
              :key="'yr-' + yr.label"
              class="gantt-year-header"
              :style="{ width: yr.cols * 32 + 'px' }"
            >
              <span class="year-label">{{ yr.label }}</span>
            </div>
          </div>
        </div>
        <!-- 时间轴头部：周 -->
        <div class="gantt-header">
          <div class="gantt-row-label"></div>
          <div class="gantt-weeks">
            <div
              v-for="w in allWeeks"
              :key="w"
              class="gantt-week-header"
              :class="{ 'current-week': w === currentWeekKey }"
            >
              <span class="week-label">{{ weekLabel(w) }}</span>
            </div>
          </div>
        </div>

        <!-- 阶段 Bar -->
        <div
          v-for="s in stages"
          :key="s.id"
          class="gantt-row"
          :class="{ 'active-stage': s.id === currentStage }"
        >
          <div class="gantt-row-label">
            <div class="stage-name" :style="{ color: s.color }">{{ s.name }}</div>
            <div class="stage-weeks-label">{{ s.start_week }} - {{ s.end_week }}</div>
            <el-tag v-if="s.id === currentStage" size="small" type="warning" effect="dark" style="margin-top:2px;">当前</el-tag>
          </div>
          <div class="gantt-bars">
            <div
              v-for="w in allWeeks"
              :key="w"
              class="gantt-week-cell"
              :class="weekCellClass(s, w)"
              :style="weekCellStyle(s, w)"
              @click="handleWeekClick(s, w)"
            >
              <span v-if="isInStage(s, w)" class="team-count-badge">
                {{ teamCountInStage(s.id) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 编辑时间对话框 -->
    <el-dialog v-model="showTimeEdit" title="编辑阶段时间" width="680px">
      <el-table :data="editStages" size="small">
        <el-table-column label="阶段" width="110">
          <template #default="{row}">
            <span :style="{color:row.color,fontWeight:600}">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="年份" width="70">
          <template #default="{row}">
            <el-tag :type="weekYearTag(row.start_week)" size="small" effect="plain">{{ weekYearLabel(row.start_week) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="开始周" width="110">
          <template #default="{row}">
            <el-input v-model="row.start_week" size="small" placeholder="W40" />
          </template>
        </el-table-column>
        <el-table-column label="结束周" width="110">
          <template #default="{row}">
            <el-input v-model="row.end_week" size="small" placeholder="W41" />
          </template>
        </el-table-column>
        <el-table-column label="持续(周)" width="130">
          <template #default="{row}">
            <el-input-number v-model="row.duration_weeks" :min="1" :max="52" size="small" style="width:110px;" @change="val => onDurationChange(row, val)" />
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="showTimeEdit = false">取消</el-button>
        <el-button type="primary" @click="saveStageTimes" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 阶段详情卡片 -->
    <el-card v-if="selectedStageDetail" shadow="never" style="margin-top:16px;">
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-weight:600;">{{ selectedStageDetail.name }} 详情</span>
          <el-button size="small" @click="selectedStageDetail = null">关闭</el-button>
        </div>
      </template>
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="时间">{{ selectedStageDetail.start_week }} → {{ selectedStageDetail.end_week }} ({{ selectedStageDetail.duration_weeks }}周)</el-descriptions-item>
        <el-descriptions-item label="参与团队">{{ activeTeamCount(selectedStageDetail.id) }}个</el-descriptions-item>
      </el-descriptions>
      <h4 style="margin:12px 0 6px;">平台分配</h4>
      <el-table :data="stageAllocs(selectedStageDetail.id)" size="small">
        <el-table-column prop="team_name" label="团队" width="120">
          <template #default="{row}">
            <span :style="{color:row.team_color,fontWeight:600}">{{ row.team_name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="平台" min-width="200">
          <template #default="{row}">
            <el-tag v-for="pid in (row.platforms||'').split(',').filter(Boolean)" :key="pid" size="small" style="margin:2px;">
              {{ pid }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="模式" width="80">
          <template #default="{row}">
            <el-tag :type="row.slot_mode==='full'?'danger':'info'" size="small">{{ row.slot_mode==='full'?'独占':'共享' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="优先级" width="70">
          <template #default="{row}">
            <el-tag :type="row.priority===0?'danger':row.priority===1?'warning':'success'" size="small">P{{ row.priority }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { Edit, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getStages, updateStage, getStageOverview, getStageComparison } from '@/api'

const currentProject = inject('currentProject', ref(''))
const stages = ref([])
const editStages = ref([])
const allTeams = ref([])
const stageData = ref([])
const currentStage = ref('BU')
const showTimeEdit = ref(false)
const saving = ref(false)
const highlightStage = ref('')
const selectedStageDetail = ref(null)

// 只读判定: 仅 admin 可写; owner 等角色对所有页面只读
const isAdmin = computed(() => { try { const u = JSON.parse(localStorage.getItem('hw_reservation_user') || 'null'); return !!(u && u.role === 'admin') } catch (e) { return false } })

// ---- 周粒度 (阶段时间轴) ----
const currentWeekNumber = computed(() => {
  const now = new Date()
  const jan1 = new Date(now.getFullYear(), 0, 1)
  const days = Math.floor((now - jan1) / 86400000)
  return Math.ceil((days + jan1.getDay() + 1) / 7)
})

const allWeeks = computed(() => {
  const weeks = []
  const cw = currentWeekNumber.value
  for (let w = cw; w <= 52; w++) weeks.push('2026-W' + w)
  for (let w = 1; w <= 52; w++) weeks.push('2027-W' + w)
  return weeks
})

const yearRanges = computed(() => {
  const weeks = allWeeks.value
  const ranges = []
  let cur = '', cnt = 0
  for (const w of weeks) {
    const yr = w.slice(0, 4)
    if (yr !== cur) {
      if (cur) ranges.push({ label: cur, cols: cnt })
      cur = yr
      cnt = 0
    }
    cnt++
  }
  if (cur) ranges.push({ label: cur, cols: cnt })
  return ranges
})

function weekYearLabel(weekStr) {
  const wn = weekNum(weekStr)
  if (isNaN(wn)) return ''
  if (wn >= 40 && wn <= 52) return '2026'
  if (wn >= 1 && wn <= 9) return '2027'
  return wn <= 9 ? '2027' : '2026'
}

function weekYearTag(weekStr) {
  const yr = weekYearLabel(weekStr)
  return yr === '2027' ? 'success' : 'primary'
}

const currentWeek = computed(() => {
  const now = new Date()
  const jan1 = new Date(now.getFullYear(), 0, 1)
  const days = Math.floor((now - jan1) / 86400000)
  let wn = Math.ceil((days + jan1.getDay() + 1) / 7)
  return `W${wn}`
})

// 当前周完整键 (年份+周号), 用于表头高亮: 只有当年同周匹配, 避免 2027-W35 也被高亮
const currentWeekKey = computed(() => new Date().getFullYear() + '-' + currentWeek.value)

function weekNum(w) {
  const m = (w || '').match(/(?:W)(\d+)/i)
  return m ? parseInt(m[1]) : NaN
}

function weekYear(weekStr) {
  const m = (weekStr || '').match(/^(\d{4})/)
  return m ? m[1] : ''
}

function isInStage(stage, week) {
  if (!stage.start_week) return false
  const start = weekNum(stage.start_week)
  const end = weekNum(stage.end_week)
  const w = weekNum(week)
  const wy = weekYear(week)
  if (isNaN(start) || isNaN(end) || isNaN(w)) return false
  const isCrossYear = (start > end)
  if (isCrossYear) {
    // 跨年阶段: 2026 年覆盖 start~W52, 2027 年覆盖 W1~end
    if (wy === '2026' && start <= 52) return w >= start && w <= 52
    if (wy === '2027') return w >= 1 && w <= end
    return false
  }
  // 非跨年: 阶段固定归属年份由 start_week 决定 (W10~W52 → 2026 年, W1~W9 → 2027 年)
  const stageYear = start <= 9 ? '2027' : '2026'
  if (wy !== stageYear) return false
  return w >= start && w <= end
}

// 周标题: "2027-W1" → "W1" (slice(-3) 对一位数周号会截出 "-W1")
function weekLabel(w) {
  const m = String(w || '').match(/W\d+$/i)
  return m ? m[0] : w
}

function weekCellClass(stage, week) {
  return isInStage(stage, week) ? 'in-stage' : ''
}

function weekCellStyle(stage, week) {
  if (isInStage(stage, week)) {
    const opacity = stage.id === currentStage ? 0.9 : 0.6
    return {
      background: `${stage.color}${Math.round(opacity * 40).toString(16).padStart(2, '0')}`,
      borderBottom: `2px solid ${stage.color}`
    }
  }
  return {}
}

function teamCountInStage(stageId) {
  const sd = stageData.value.find(s => s.id === stageId)
  return sd ? sd.allocations.filter(a => a.platforms).length : 0
}

function handleWeekClick(stage, week) {
  if (isInStage(stage, week)) {
    selectedStageDetail.value = stage
  }
}

// ---- 日粒度（已移除团队活动时间线卡片，相关函数已删除）
function stageAllocs(stageId) {
  const sd = stageData.value.find(s => s.id === stageId)
  return sd ? sd.allocations.filter(a => a.platforms) : []
}

function activeTeamCount(stageId) {
  return stageAllocs(stageId).length
}

async function openTimeEdit() {
  editStages.value = stages.value.map(s => ({
    ...s,
    start_week: s.start_week || '',
    end_week: s.end_week || '',
    duration_weeks: s.duration_weeks || 8
  }))
  showTimeEdit.value = true
}

function weekNumOnly(w) {
  const m = (w || '').match(/(?:W)(\d+)/i)
  return m ? parseInt(m[1]) : NaN
}

function onDurationChange(row, weeks) {
  const sn = weekNumOnly(row.start_week)
  if (isNaN(sn) || weeks <= 0) return
  // 计算该阶段新的结束周
  let en = sn + weeks - 1
  row.end_week = en > 52 ? 'W' + (en - 52) : 'W' + en

  // 级联更新所有后续阶段：每个阶段的 start_week = 上个阶段 end_week + 1
  const idx = editStages.value.indexOf(row)
  for (let i = idx + 1; i < editStages.value.length; i++) {
    const cur = editStages.value[i]
    const prev = editStages.value[i - 1]
    const prevEnd = weekNumOnly(prev.end_week)
    if (isNaN(prevEnd)) break
    // 计算本阶段的期望开始周
    let newStart = prevEnd + 1
    if (newStart > 52) newStart = newStart - 52
    cur.start_week = 'W' + newStart
    // 根据 duration_weeks 更新结束周
    const dur = parseInt(cur.duration_weeks)
    if (!isNaN(dur) && dur > 0) {
      let newEnd = newStart + dur - 1
      cur.end_week = newEnd > 52 ? 'W' + (newEnd - 52) : 'W' + newEnd
    }
  }
}

async function saveStageTimes() {
  saving.value = true
  try {
    for (const s of editStages.value) {
      await updateStage(s.id, {
        start_week: s.start_week,
        end_week: s.end_week,
        duration_weeks: s.duration_weeks
      })
    }
    ElMessage.success('阶段时间已保存')
    showTimeEdit.value = false
    await loadData()
  } catch(e) {
    ElMessage.error('保存失败：' + (e.response?.data?.error || e.message))
  } finally {
    saving.value = false
  }
}

async function loadData() {
  try {
    const [stageRes, allocRes] = await Promise.all([
      getStages(),
      getStageOverview()
    ])
    stages.value = stageRes.data.stages || []
    currentStage.value = stageRes.data.currentStage || 'BU'
    allTeams.value = allocRes.data.teams || []

    // Build stageData for allocations
    const comparison = await getStageComparison().catch(() => ({ data: { stages: [] } }))
    stageData.value = comparison.data.stages || []
  } catch(e) {
    ElMessage.error('加载阶段数据失败')
  }
}

onMounted(loadData)

// 监听项目切换事件
if (typeof window !== 'undefined') {
  window.addEventListener('project-changed', () => { loadData() })
}
</script>

<style scoped>
.gantt-container {
  overflow-x: auto;
  font-size: 11px;
}
.gantt-header {
  display: flex;
  align-items: center;
}
.gantt-row-label {
  width: 120px;
  min-width: 120px;
  padding: 4px 8px;
  font-size: 12px;
}
.gantt-weeks {
  display: flex;
}
.gantt-year-header {
  text-align: center;
  font-weight: 700;
  color: #8b93a7;
  border-bottom: 1px solid rgba(255,255,255,.12);
  line-height: 28px;
}
.gantt-week-header {
  width: 32px;
  text-align: center;
  border-right: 1px solid rgba(255,255,255,.12);
  color: #8b93a7;
  line-height: 22px;
}
.gantt-week-header.current-week {
  background: #3a4157;
  font-weight: 700;
  color: #E6A23C;
}
.gantt-row {
  display: flex;
  align-items: center;
  min-height: 40px;
  border-bottom: 1px solid rgba(255,255,255,.08);
}
.gantt-row.active-stage {
  background: #1d2436;
}
.gantt-bars {
  display: flex;
}
.gantt-week-cell {
  width: 32px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
}
.gantt-week-cell.in-stage {
  cursor: pointer;
}
.team-count-badge {
  font-size: 10px;
  color: #e6e9f2;
  background: rgba(255,255,255,0.14);
  padding: 0 4px;
  border-radius: 3px;
}
.stage-name { font-weight: 600; font-size: 13px; }
.stage-weeks-label { font-size: 10px; color: #8b93a7; }

/* Day Gantt (当前未启用, 保持与深色主题一致的兜底) */
.day-gantt-container {
  overflow-x: auto;
  font-size: 11px;
}
.dg-header {
  display: flex;
  align-items: center;
}
.dg-row-label {
  width: 100px;
  min-width: 100px;
  padding: 4px 8px;
  font-size: 12px;
}
.dg-months {
  display: flex;
}
.dg-month-header {
  text-align: center;
  font-weight: 600;
  color: #8b93a7;
  border-bottom: 1px solid rgba(255,255,255,.12);
  line-height: 24px;
}
.dg-days {
  display: flex;
}
.dg-day-header {
  text-align: center;
  border-right: 1px solid rgba(255,255,255,.1);
  padding: 2px 0;
}
.dg-day-header.weekend {
  background: rgba(255,255,255,.04);
  color: #8b93a7;
}
.dg-day-header.today {
  background: #3a4157;
  font-weight: 700;
}
.day-num { font-size: 11px; line-height: 1.2; }
.day-dow { font-size: 9px; color: #8b93a7; }
.dg-row {
  display: flex;
  align-items: center;
  border-bottom: 1px solid rgba(255,255,255,.08);
}
.dg-day-cell {
  height: 28px;
  border-right: 1px solid rgba(255,255,255,.08);
}
.dg-day-cell.empty {
  background: #1d2436;
}
.dg-day-cell.active {
  background: #409EFF;
  opacity: 0.4;
}
.dg-day-cell.active.p0 {
  background: #F56C6C;
  opacity: 0.6;
}
.dg-day-cell.active.p1 {
  background: #E6A23C;
  opacity: 0.5;
}
.dg-day-cell.active.p2 {
  background: #67C23A;
  opacity: 0.4;
}
.team-label {
  font-weight: 600;
  white-space: nowrap;
}
</style>