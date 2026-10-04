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

    <!-- === 分配参考图 === -->
    <el-card shadow="never" style="margin-bottom:12px">
      <template #header>
        <div class="chd">
          <span class="ctitle">分配参考图</span>
          <div class="cright">
            <el-button size="small" @click="loadAllocData">刷新</el-button>
          </div>
        </div>
      </template>
      <div class="ref-img-wrap">
        <img src="/hwallocate.png" alt="分配参考图" class="ref-img" />
      </div>
    </el-card>

    <!-- 编辑预分配时间弹窗 -->
    <el-dialog v-model="showDateEdit" title="编辑Bringup时间（14天）" width="380px">
      <div style="font-size:12px;color:#999;margin-bottom:12px;">选择起始日期，自动往后14天</div>
      <el-date-picker v-model="pickDate" type="date" placeholder="选择起始日期"
        value-format="YYYY-MM-DD" style="width:100%;"
        :disabled-date="d => d < new Date(2026,0,1) || d > new Date(2027,11,31)" />
      <div v-if="pickDate" style="margin-top:10px;font-size:12px;color:#8b93a7;">
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
import { ref, computed, onMounted, inject, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getPlatforms, getStages, updateStage, getOverview } from '@/api'

const currentProject = inject('currentProject', ref(''))

const TEAM_COLOR_MAP = {
  hbm: '#F97316', ucie: '#84CC16', jtag: '#0891B2', swtool: '#0369A1',
  board: '#DC2626', diag: '#2563EB', ethernet: '#16A34A', firmware: '#D97706',
  kmd: '#CA8A04', mbist: '#DB2777', pcie: '#0E7490', ppo: '#65A30D',
  slt: '#A21CAF', swci: '#0D9488', swmodel: '#BE185D', umd: '#15803D',
  video: '#B45309', dft: '#7C3AED', npival: '#4F46E5', computelib: '#0EA5E9',
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
    platforms.value = (p.data.platforms || []).filter(function(p) { return (p.project || '') === currentProject.value; })
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

watch(currentProject, () => { loadAllocData() })

onMounted(() => { loadAllocData() })
</script>

<style scoped>
.chd { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; }
.ctitle { font-weight:600; font-size:14px; }
.cright { display:flex; align-items:center; gap:6px; }
.matrix-wrap { overflow-x: auto; }
.mx { width:100%; font-size:12px; }
.mx-hdr { display:flex; border-bottom:2px solid rgba(255,255,255,.25); background:#000; color:#fff; }
.mx-row { display:flex; border-bottom:1px solid #f0f0f0; min-height:44px; }
.mx-lbl { width:60px; min-width:60px; max-width:60px; display:flex; align-items:center; padding:4px 6px; font-weight:600; font-size:12px; }
.mx-d { flex:1; text-align:center; border-right:1px solid #f0f0f0; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:44px; padding:1px; position:relative; overflow:hidden; }
.mx-hdr .mx-d { background:#000; min-height:36px; border-right:1px solid rgba(255,255,255,.12); }
.dn { font-size:11px; line-height:1.3; color:#fff; }
.dw { color:rgba(255,255,255,.6); font-size:9px; }
.tag { font-size:16px; font-weight:400; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; position:absolute; top:0; left:0; right:0; bottom:0; display:flex; align-items:center; justify-content:center; z-index:1; }
.ref-img-wrap { overflow-x:auto; }
.ref-img { max-width:100%; height:auto; display:block; border-radius:4px; border:1px solid rgba(255,255,255,.1); }
</style>