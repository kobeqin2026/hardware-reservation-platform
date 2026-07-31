<template>
  <div class="bringup-view" style="padding:0">

    <!-- === 上栏：预分配 === -->
    <el-card shadow="never" style="margin-bottom:12px">
      <template #header>
        <div class="chd">
          <span class="ctitle">预分配</span>
          <div class="cright">
            <template v-if="isAdmin">
              <el-button size="small" type="primary" @click="openDateEdit">编辑时间</el-button>
              <el-button size="small" type="primary" @click="openAllocEdit">{{ allocEditing ? '退出分配' : '编辑分配' }}</el-button>
            </template>
            <el-button size="small" @click="loadData">刷新</el-button>
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

    <!-- === 下栏：当前活跃 === -->
    <el-card shadow="never">
      <template #header>
        <div class="chd">
          <span class="ctitle">当前活跃</span>
          <span class="csub">{{ activeRes.length ? activeRes.map(r=>r.platform_label+'—'+r.team_name).join(' | ') : '无' }}</span>
        </div>
      </template>
      <div class="matrix-wrap">
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
            <div class="mx-d" v-for="(d,i) in dayRange" :key="i">
              <span v-if="actRows.includes(p.id)" class="tag" :style="cellStyle(p.id)">●</span>
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 编辑时间弹窗 -->
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

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getPlatforms, getStages, updateStage, getOverview } from '@/api'

// 18个颜色，每个团队一个：board,diag,ethernet,firmware,hbm,jtag,kmd,mbist,pcie,ppo,slt,swci,swmodel,swtool,ucie,umd,video + 1 spare
// 使用 HSL 均匀分布：色相间隔20度，饱和度和明度交替，确保相邻团队颜色差异明显
const TEAM_COLORS = [
  '#DC2626', // board - 红
  '#2563EB', // diag - 蓝
  '#16A34A', // ethernet - 绿
  '#D97706', // firmware - 橙
  '#F97316', // hbm - 橙色 ← 与所有蓝色/紫色/青色完全区分
  '#0891B2', // jtag - 青
  '#CA8A04', // kmd - 金
  '#DB2777', // mbist - 粉
  '#0E7490', // pcie - 深青
  '#65A30D', // ppo - 草绿
  '#A21CAF', // slt - 紫罗兰
  '#0D9488', // swci - 碧绿
  '#BE185D', // swmodel - 玫红
  '#0369A1', // swtool - 深蓝 ← 从红色改回蓝色系
  '#84CC16', // ucie - 荧光绿 ← 与青、蓝、紫完全不同
  '#15803D', // umd - 墨绿
  '#B45309', // video - 棕
  '#C026D3'  // spare - 洋红
]

const loading = ref(false)
const saving = ref(false)
const platforms = ref([])
const allTeams = ref([])
const allocations = ref([])
const activeRes = ref([])
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

const actRows = computed(() => {
  const fromRes = activeRes.value.map(r => r.platform_id)
  const fromStatus = activePlatforms.value.filter(pid => !fromRes.includes(pid))
  return [...fromRes, ...fromStatus]
})
const activePlatforms = ref([])

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
  // 硬编码常见团队颜色，避免 hash 映射到太接近的色系
  const TEAM_COLOR_MAP = {
    hbm: '#F97316',     // 橙色
    ucie: '#84CC16',    // 荧光绿
    jtag: '#0891B2',    // 青
    swtool: '#0369A1',  // 深蓝
    board: '#DC2626',   // 红
    diag: '#2563EB',    // 蓝
    ethernet: '#16A34A',// 绿
    firmware: '#D97706',// 橙
    kmd: '#CA8A04',     // 金
    mbist: '#DB2777',   // 粉
    pcie: '#0E7490',    // 深青
    ppo: '#65A30D',     // 草绿
    slt: '#A21CAF',     // 紫罗兰
    swci: '#0D9488',    // 碧绿
    swmodel: '#BE185D', // 玫红
    umd: '#15803D',     // 墨绿
    video: '#B45309',   // 棕
  }
  if (TEAM_COLOR_MAP[teamId]) return colorStyle(TEAM_COLOR_MAP[teamId])
  const idx = (teamId||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0)
  return colorStyle(TEAM_COLORS[idx % TEAM_COLORS.length])
}

function colorStyle(c) {
  return { background: c+'22', color: c, border:'1px solid '+c+'44', borderRadius:'3px', padding:'1px 4px', fontWeight:400, fontSize:'16px' }
}

function onCellChange(pid, dt, val) {
  const key = pid+'_'+dt.getTime()
  if (val) {
    allocGrid.value = { ...allocGrid.value, [key]: val }
    // 保存到后端
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
  else {
    ElMessage.success('分配已保存')
  }
}

/*
async function saveAllocGrid() {
  const g = allocGrid.value
  const teamPlats = {}
  const dayStamps = dayRange.value.map(d => d.getTime())
  for (const [k, v] of Object.entries(g)) {
    if (!v) continue
    const pid = k.split('_')[0]
    const ts = parseInt(k.split('_')[1])
    if (!dayStamps.includes(ts)) continue
    if (!teamPlats[v]) teamPlats[v] = new Set()
    teamPlats[v].add(pid)
  }
  for (const [teamId, plats] of Object.entries(teamPlats)) {
    const platList = [...plats].sort().join(',')
    try { await apiPut('/teams/allocate', { teamId, platforms: platList, priority: 0 }) }
    catch(e) { console.error('保存分配失败', teamId, e) }
  }
}
*/

async function saveDates() {
  if (!pickDate.value) { ElMessage.warning('请选择起始日期'); return }
  saving.value = true
  try {
    const sd = new Date(pickDate.value); const ed = new Date(sd); ed.setDate(ed.getDate()+13)
    const fmt = d => String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
    await updateStage('BU', { bringupStart: fmt(sd), bringupEnd: fmt(ed) })
    ElMessage.success('时间已更新'); showDateEdit.value = false; await loadData()
  } catch(e) { ElMessage.error('保存失败') }
  finally { saving.value = false }
}

async function loadData() {
  loading.value = true
  try {
    const [p, s, o, da] = await Promise.all([
      getPlatforms(), getStages(), getOverview(),
      fetch('/api/teams/day-allocations').then(r=>r.json())
    ])
    platforms.value = p.data.platforms || []
    bs.value = s.data.bringupStart || '09-28'
    be.value = s.data.bringupEnd || '10-11'
    allocations.value = o.data?.allocations || []
    allTeams.value = o.data?.teams || []
    activeRes.value = o.data?.activeReservations || []
    // 获取 in_use 状态的平台
    const platRes = await fetch('/api/platforms').then(r=>r.json())
    activePlatforms.value = (platRes.platforms||[]).filter(p => p.status === 'in_use').map(p => p.id)
    // 从 day_allocations 填充 grid
    const g = {}
    for (const daRow of da) {
      const key = daRow.platform_id + '_' + daRow.date_stamp
      g[key] = daRow.team_id
    }
    allocGrid.value = g
  } catch(e) { console.error(e) }
  finally { loading.value = false }
}

onMounted(() => { loadData() })
</script>

<style scoped>
.chd { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; }
.ctitle { font-weight:600; font-size:14px; }
.cright { display:flex; align-items:center; gap:6px; }
.csub { font-size:12px; color:#999; }
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
</style>