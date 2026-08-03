<template>
  <div class="bringup-view" style="padding:0">

    <!-- === 上栏：预分配（保持不变） === -->
    <el-card shadow="never" style="margin-bottom:12px">
      <template #header>
        <div class="chd">
          <span class="ctitle">预分配</span>
          <div class="cright">
            <template v-if="isAdmin">
              <el-button size="small" type="primary" @click="openDateEdit">编辑时间</el-button>
              <el-button size="small" type="primary" @click="openAllocEdit">{{ allocEditing ? '退出分配' : '编辑分配' }}</el-button>
            </template>
            <el-button size="small" @click="loadAllocData">刷新</el-button>
          </div>
        </div>
      </template>
      <div class="matrix-wrap" v-loading="loading">
        <div class="mx">
          <div class="mx-hdr">
            <div class="mx-lbl">平台</div>
            <div class="mx-d" v-for="(d,i) in dayRange" :key="i">
              <div class="dn">{{ d.getDate() }}</div>
              <div class="dw">{{ '日一二三四五六'[d.getDay()] }}</div>
            </div>
          </div>
          <div class="mx-row" v-for="p in platforms" :key="p.id">
            <div class="mx-lbl">{{ p.label }}</div>
            <div class="mx-d" v-for="(d,i) in dayRange" :key="i" style="position:relative;overflow:hidden;">
              <div v-if="allocGrid[p.id+'_'+d.getTime()]" class="tag" :style="cellStyle(allocGrid[p.id+'_'+d.getTime()])">{{ teamName(allocGrid[p.id+'_'+d.getTime()]) }}</div>
              <el-select v-if="allocEditing" v-model="allocGrid[p.id+'_'+d.getTime()]" size="small" style="width:100%;min-width:70px;position:relative;z-index:2;" placeholder="-" clearable
                @change="val => onCellChange(p.id, d, val)">
                <el-option v-for="t in allTeams" :key="t.id" :label="t.display_name||t.id" :value="t.id" />
              </el-select>
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <!-- === 下栏：当前活跃 Gantt 条状图 === -->
    <el-card shadow="never">
      <template #header>
        <div class="chd">
          <span class="ctitle">当前活跃</span>
          <div class="cright">
            <template v-if="isAdmin">
              <el-button size="small" type="primary" @click="openActiveDateEdit">编辑时间</el-button>
            </template>
            <el-button size="small" @click="loadActiveData">刷新</el-button>
          </div>
        </div>
      </template>
      <div class="gantt-wrap" v-loading="activeLoading">
        <div v-if="!activeRows.length" style="text-align:center;padding:32px 0;color:#999;font-size:13px;">暂无活跃预约</div>
        <div v-else class="gantt">
          <div class="gantt-hdr">
            <div class="gantt-lbl">平台</div>
            <div class="gantt-d" v-for="(d,i) in activeDayRange" :key="i">
              <div class="dn">{{ d.getDate() }}</div>
              <div class="dw">{{ '日一二三四五六'[d.getDay()] }}</div>
            </div>
          </div>
          <div class="gantt-row" v-for="r in activeRows" :key="r.platform_id">
            <div class="gantt-lbl">{{ r.platform_label }}</div>
            <div class="gantt-track">
              <div class="gantt-grid">
                <div class="gantt-cell" v-for="(d,i) in activeDayRange" :key="i"></div>
              </div>
              <div class="gantt-bar"
                :style="barStyle(r, activeDayRange)"
                :title="`${r.team_name} - ${r.purpose || ''}`">
                <span class="bar-team">{{ r.team_name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 编辑预分配时间弹窗 -->
    <el-dialog v-model="showDateEdit" title="编辑Bringup时间（14天）" width="380px">
      <div style="font-size:12px;color:#999;margin-bottom:12px;">选择起始日期，自动往后14天</div>
      <el-date-picker v-model="pickDate" type="date" placeholder="选择起始日期"
        value-format="YYYY-MM-DD" style="width:100%;"
        :disabled-date="d => d < new Date(2026,0,1) || d > new Date(2027,11,31)" />
      <div v-if="pickDate" style="margin-top:10px;font-size:12px;color:#606266;">
        选定日期: <strong>{{ pickDate }}</strong><br>
        日期范围: <strong>{{ pickDate }}</strong> ~ <strong>{{ endDateStr }}</strong>
      </div>
      <template #footer>
        <el-button @click="showDateEdit=false">取消</el-button>
        <el-button type="primary" @click="saveDates" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 编辑当前活跃时间弹窗 -->
    <el-dialog v-model="showActiveDateEdit" title="编辑当前活跃时间轴" width="380px">
      <div style="font-size:12px;color:#999;margin-bottom:12px;">选择起始日期，自动往后14天</div>
      <el-date-picker v-model="activePickDate" type="date" placeholder="选择起始日期"
        value-format="YYYY-MM-DD" style="width:100%;"
        :disabled-date="d => d < new Date(2026,0,1) || d > new Date(2027,11,31)" />
      <div v-if="activePickDate" style="margin-top:10px;font-size:12px;color:#606266;">
        选定日期: <strong>{{ activePickDate }}</strong><br>
        日期范围: <strong>{{ activePickDate }}</strong> ~ <strong>{{ activeEndDateStr }}</strong>
      </div>
      <template #footer>
        <el-button @click="showActiveDateEdit=false">取消</el-button>
        <el-button type="primary" @click="saveActiveDates" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getPlatforms, getStages, updateStage, getOverview } from '@/api'

const currentProject = inject('currentProject', ref('BR288Y'))

const TEAM_COLOR_MAP = {
  hbm: '#F97316', ucie: '#84CC16', jtag: '#0891B2', swtool: '#0369A1',
  board: '#DC2626', diag: '#2563EB', ethernet: '#16A34A', firmware: '#D97706',
  kmd: '#CA8A04', mbist: '#DB2777', pcie: '#0E7490', ppo: '#65A30D',
  slt: '#A21CAF', swci: '#0D9488', swmodel: '#BE185D', umd: '#15803D',
  video: '#B45309',
}

// ========= 预分配 =========
const loading = ref(false)
const saving = ref(false)
const platforms = ref([])
const allTeams = ref([])
const allocations = ref([])
const bs = ref('09-28')
const be = ref('10-11')
const showDateEdit = ref(false)
const allocEditing = ref(false)
const pickDate = ref('')
const allocGrid = ref({})

const isAdmin = computed(() => {
  try { return JSON.parse(localStorage.getItem('hw_reservation_user')||'{}').role === 'admin' }
  catch { return false }
})

const dayRange = computed(() => {
  const sm = bs.value.match(/^(\d+)-(\d+)$/)
  const em = be.value.match(/^(\d+)-(\d+)$/)
  if (!sm || !em) return []
  const s = new Date(2026, +sm[1]-1, +sm[2])
  const e = new Date(2026, +em[1]-1, +em[2])
  const d = [], c = new Date(s)
  while (c <= e) { d.push(new Date(c)); c.setDate(c.getDate()+1) }
  return d
})

const endDateStr = computed(() => {
  if (!pickDate.value) return ''
  const d = new Date(pickDate.value); d.setDate(d.getDate()+13)
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
})

function teamName(id) {
  const t = allTeams.value.find(x => x.id === id)
  return t ? (t.display_name || t.id) : id
}

function cellStyle(teamId) {
  const c = TEAM_COLOR_MAP[teamId] || '#409EFF'
  return { background: c+'22', color: c, border:'1px solid '+c+'44', borderRadius:'3px', padding:'1px 4px', fontWeight:400, fontSize:'16px' }
}

function onCellChange(pid, dt, val) {
  const key = pid+'_'+dt.getTime()
  if (val) {
    allocGrid.value = { ...allocGrid.value, [key]: val }
    fetch('/api/teams/day-allocate', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({platformId:pid, dateStamp:dt.getTime(), teamId:val}) })
  } else {
    const cp = { ...allocGrid.value }; delete cp[key]; allocGrid.value = cp
    fetch('/api/teams/day-allocate', { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({platformId:pid, dateStamp:dt.getTime()}) })
  }
}

function openDateEdit() {
  pickDate.value = dayRange.value.length ? dayRange.value[0].getFullYear()+'-'+String(dayRange.value[0].getMonth()+1).padStart(2,'0')+'-'+String(dayRange.value[0].getDate()).padStart(2,'0') : ''
  showDateEdit.value = true
}

function openAllocEdit() {
  allocEditing.value = !allocEditing.value
  if (allocEditing.value) { ElMessage.info('在格子中选择团队') }
  else { ElMessage.success('分配已保存') }
}

async function saveDates() {
  if (!pickDate.value) { ElMessage.warning('请选择起始日期'); return }
  saving.value = true
  try {
    const sd = new Date(pickDate.value); const ed = new Date(sd); ed.setDate(ed.getDate()+13)
    const fmt = d => String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
    await updateStage('BU', { bringupStart: fmt(sd), bringupEnd: fmt(ed) })
    ElMessage.success('时间已更新'); showDateEdit.value = false; await loadAllocData()
  } catch(e) { ElMessage.error('保存失败') }
  finally { saving.value = false }
}

async function loadAllocData() {
  loading.value = true
  try {
    const [p, s, o, da] = await Promise.all([
      getPlatforms(), getStages(), getOverview(),
      fetch('/api/teams/day-allocations').then(r=>r.json())
    ])
    platforms.value = (p.data.platforms || []).filter(function(p) { return (p.project || 'BR288Y') === currentProject.value; })
    bs.value = s.data.bringupStart || '09-28'
    be.value = s.data.bringupEnd || '10-11'
    allocations.value = o.data?.allocations || []
    allTeams.value = o.data?.teams || []
    const g = {}
    for (const daRow of da) {
      const key = daRow.platform_id + '_' + daRow.date_stamp
      g[key] = daRow.team_id
    }
    allocGrid.value = g
  } catch(e) { console.error(e) }
  finally { loading.value = false }
}

// ========= 当前活跃 Gantt =========
const activeLoading = ref(false)
const activeRes = ref([])
const activeBs = ref('')
const activeBe = ref('')
const showActiveDateEdit = ref(false)
const activePickDate = ref('')

const activeDayRange = computed(() => {
  const s = activeBs.value ? new Date(activeBs.value) : null
  const e = activeBe.value ? new Date(activeBe.value) : null
  if (!s || !e || isNaN(s.getTime()) || isNaN(e.getTime())) return []
  const d = [], c = new Date(s)
  while (c <= e) { d.push(new Date(c)); c.setDate(c.getDate()+1) }
  return d
})

const activeEndDateStr = computed(() => {
  if (!activePickDate.value) return ''
  const d = new Date(activePickDate.value); d.setDate(d.getDate()+13)
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
})

const activeRows = computed(() => {
  const seen = new Set()
  return activeRes.value.filter(r => {
    if (seen.has(r.platform_id)) return false
    seen.add(r.platform_id)
    return true
  })
})

function barStyle(r, dayRange) {
  if (!dayRange || dayRange.length < 2) return { display: 'none' }
  const totalMs = dayRange[dayRange.length-1].getTime() - dayRange[0].getTime()
  if (totalMs <= 0) return { display: 'none' }
  const started = new Date((r.started_at||'').replace(' ', 'T'))
  const ended = new Date((r.ended_at||'').replace(' ', 'T'))
  if (isNaN(started.getTime())) return { display: 'none' }
  const left = Math.max(0, (started.getTime() - dayRange[0].getTime()) / totalMs * 100)
  const right = isNaN(ended.getTime())
    ? 100
    : Math.min(100, (ended.getTime() - dayRange[0].getTime()) / totalMs * 100)
  const width = Math.max(3, right - left)
  const c = TEAM_COLOR_MAP[r.team_id] || '#409EFF'
  return {
    left: left + '%',
    width: width + '%',
    background: c + 'CC',
    color: '#fff',
    borderLeft: '3px solid ' + c,
  }
}

function openActiveDateEdit() {
  activePickDate.value = activeDayRange.value.length
    ? activeDayRange.value[0].getFullYear()+'-'+String(activeDayRange.value[0].getMonth()+1).padStart(2,'0')+'-'+String(activeDayRange.value[0].getDate()).padStart(2,'0')
    : ''
  showActiveDateEdit.value = true
}

async function saveActiveDates() {
  if (!activePickDate.value) { ElMessage.warning('请选择起始日期'); return }
  saving.value = true
  try {
    const sd = new Date(activePickDate.value)
    const ed = new Date(sd); ed.setDate(ed.getDate()+13)
    localStorage.setItem('hw_active_gantt_start', sd.toISOString().slice(0,10))
    localStorage.setItem('hw_active_gantt_end', ed.toISOString().slice(0,10))
    activeBs.value = sd.toISOString().slice(0,10)
    activeBe.value = ed.toISOString().slice(0,10)
    ElMessage.success('时间已更新')
    showActiveDateEdit.value = false
  } catch(e) { ElMessage.error('保存失败') }
  finally { saving.value = false }
}

async function loadActiveData() {
  activeLoading.value = true
  try {
    const res = await fetch(`/api/reservations/active-summary?project=${encodeURIComponent(currentProject.value)}`).then(r=>r.json())
    activeRes.value = res || []

    let startDate
    if (res && res.length) {
      const dates = res.map(r => new Date((r.started_at||'').replace(' ', 'T'))).filter(d => !isNaN(d.getTime()))
      if (dates.length) {
        const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
        startDate = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())
      } else {
        startDate = new Date()
      }
    } else {
      startDate = new Date()
    }

    const savedStart = localStorage.getItem('hw_active_gantt_start')
    const savedEnd = localStorage.getItem('hw_active_gantt_end')
    if (savedStart && savedEnd) {
      activeBs.value = savedStart
      activeBe.value = savedEnd
    } else {
      const ed = new Date(startDate); ed.setDate(ed.getDate()+13)
      activeBs.value = startDate.toISOString().slice(0,10)
      activeBe.value = ed.toISOString().slice(0,10)
    }
  } catch(e) { console.error(e) }
  finally { activeLoading.value = false }
}

watch(currentProject, () => { loadAllocData(); loadActiveData() })

onMounted(() => { loadAllocData(); loadActiveData() })
</script>

<style scoped>
.chd { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; }
.ctitle { font-weight:600; font-size:14px; }
.cright { display:flex; align-items:center; gap:6px; }
.matrix-wrap { overflow-x: auto; }
.mx { width:100%; font-size:12px; }
.mx-hdr { display:flex; border-bottom:2px solid #ddd; background:#fafafa; }
.mx-row { display:flex; border-bottom:1px solid #f0f0f0; min-height:44px; }
.mx-lbl { width:60px; min-width:60px; max-width:60px; display:flex; align-items:center; padding:4px 6px; font-weight:600; font-size:12px; }
.mx-d { flex:1; text-align:center; border-right:1px solid #f0f0f0; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:44px; padding:1px; position:relative; overflow:hidden; }
.mx-hdr .mx-d { background:#fafafa; min-height:36px; }
.dn { font-size:11px; line-height:1.3; }
.dw { color:#999; font-size:9px; }
.tag { font-size:16px; font-weight:400; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; position:absolute; top:0; left:0; right:0; bottom:0; display:flex; align-items:center; justify-content:center; z-index:1; }

.gantt-wrap { overflow-x: auto; }
.gantt { width:100%; font-size:12px; position:relative; }
.gantt-hdr { display:flex; border-bottom:2px solid #ddd; background:#fafafa; position:sticky; top:0; z-index:5; }
.gantt-lbl { width:60px; min-width:60px; max-width:60px; display:flex; align-items:center; padding:4px 6px; font-weight:600; font-size:12px; }
.gantt-hdr .gantt-lbl { background:#fafafa; z-index:2; }
.gantt-d { flex:1; text-align:center; border-right:1px solid #f0f0f0; padding:2px 0; background:#fafafa; }
.gantt-row { display:flex; border-bottom:1px solid #f0f0f0; min-height:40px; }
.gantt-track { flex:1; position:relative; min-height:40px; display:flex; align-items:center; }
.gantt-grid { position:absolute; top:0; left:0; right:0; bottom:0; display:flex; }
.gantt-cell { flex:1; border-right:1px solid #f0f0f0; }
.gantt-bar {
  position:absolute; top:4px; bottom:4px; border-radius:4px;
  display:flex; align-items:center; padding-left:6px;
  font-size:12px; font-weight:500;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  z-index:2; cursor:default;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
  transition: all .15s;
}
.gantt-bar:hover { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 2px 6px rgba(0,0,0,0.18); }
.bar-team { overflow:hidden; text-overflow:ellipsis; }
</style>