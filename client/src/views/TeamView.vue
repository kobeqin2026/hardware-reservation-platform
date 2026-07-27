<template>
  <div class="team-view">
    <!-- 阶段切换 -->
    <el-card shadow="never" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-weight:600;font-size:14px;">{{ currentProject }} — 团队分配</span>
        <el-select v-model="currentStage" size="small" style="width:160px;" @change="loadData">
          <el-option v-for="s in stages" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
        <el-tag v-if="currentStageData" :type="stageTagType" size="small" effect="dark">
          {{ currentStageData.start_week }} → {{ currentStageData.end_week }}
        </el-tag>
      </div>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-weight:600;">分配概览</span>
          <span style="font-size:12px;color:#999;">共 {{ allocations.length }} 个团队参与</span>
        </div>
      </template>

      <el-table :data="allocations" stripe size="small" v-if="allocations.length" v-loading="loading">
        <el-table-column label="优先级" width="70">
          <template #default="{row}">
            <el-tag :type="row.priority === 0 ? 'danger' : row.priority === 1 ? 'warning' : 'info'" size="small" effect="dark">
              {{ row.priority === 0 ? 'P0' : row.priority === 1 ? 'P1' : 'P2' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="团队" min-width="130">
          <template #default="{row}">
            <span :style="{color: row.team_color, fontWeight:600}">{{ row.team_name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="负责人" width="200">
          <template #default="{row}">
            {{ row.owners || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="分配平台" min-width="300">
          <template #default="{row}">
            <template v-if="row.platforms">
              <el-tag
                v-for="pid in row.platforms.split(',')"
                :key="pid"
                size="small"
                style="margin:2px"
                :type="getPlatformStatus(pid) === 'idle' ? 'success' : getPlatformStatus(pid) === 'in_use' ? 'warning' : 'info'"
                effect="plain"
              >
                {{ pid }}
              </el-tag>
            </template>
            <span v-else style="color:#ccc;">-</span>
          </template>
        </el-table-column>
        <el-table-column label="模式" width="80">
          <template #default="{row}">
            <el-tag size="small" :type="row.slot_mode === 'full' ? 'danger' : 'info'">
              {{ row.slot_mode === 'full' ? '独占' : '共享' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{row}">
            <el-button size="small" type="primary" @click="quickReserve(row)">预约</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="当前阶段暂无分配数据" :image-size="80" />
    </el-card>

    <!-- 快速预约 -->
    <el-dialog v-model="reserveVisible" title="快速预约" width="450px">
      <el-form :model="reserveForm" label-width="80px">
        <el-form-item label="团队">
          <el-input :model-value="reserveForm.teamName" disabled />
        </el-form-item>
        <el-form-item label="平台">
          <el-select v-model="reserveForm.platformId" style="width:100%" placeholder="选择平台">
            <el-option
              v-for="pid in reserveForm.availablePlatforms"
              :key="pid"
              :label="pid"
              :value="pid"
              :disabled="getPlatformStatus(pid) === 'maintenance'"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-input v-model="reserveForm.owner" />
        </el-form-item>
        <el-form-item label="用途">
          <el-input v-model="reserveForm.purpose" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reserveVisible=false">取消</el-button>
        <el-button type="primary" @click="doReserve" :loading="reserving">确认预约</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, inject } from 'vue'
import { ElMessage } from 'element-plus'
import { getStageOverview, getPlatforms, getStages, reservePlatform } from '@/api'

const currentProject = inject('currentProject', ref('BR2x6'))
const allocations = ref([])
const platformMap = ref({})
const stages = ref([])
const currentStage = ref('BU')
const loading = ref(false)
const reserveVisible = ref(false)
const reserving = ref(false)

const reserveForm = reactive({
  teamId: '',
  teamName: '',
  platformId: '',
  owner: '',
  purpose: '',
  availablePlatforms: []
})

const currentStageData = computed(() =>
  stages.value.find(s => s.id === currentStage.value)
)

const stageTagType = computed(() => {
  const map = { 'BU': 'danger', 'FE': 'warning', 'FST': 'primary', 'PVT': 'success' }
  return map[currentStage.value] || 'info'
})

async function loadData() {
  loading.value = true
  try {
    const [allocRes, platRes, stageRes] = await Promise.all([
      getStageOverview(),
      getPlatforms(),
      getStages()
    ])
    allocations.value = allocRes.data.allocations || []
    currentStage.value = stageRes.data.currentStage || 'BU'

    const plats = platRes.data.platforms || []
    const map = {}
    plats.forEach(p => { map[p.id] = p.status })
    platformMap.value = map
    stages.value = stageRes.data.stages || []
  } catch(e) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

function getPlatformStatus(pid) {
  return platformMap.value[pid] || 'unknown'
}

function quickReserve(row) {
  reserveForm.teamId = row.team_id
  reserveForm.teamName = row.team_name
  reserveForm.platformId = ''
  reserveForm.owner = row.owners ? row.owners.split(',')[0] : ''
  reserveForm.purpose = ''
  reserveForm.availablePlatforms = row.platforms ? row.platforms.split(',') : []
  reserveVisible.value = true
}

async function doReserve() {
  if (!reserveForm.platformId) {
    ElMessage.warning('请选择平台')
    return
  }
  reserving.value = true
  try {
    await reservePlatform(reserveForm.teamId, reserveForm.platformId, reserveForm.purpose, reserveForm.owner)
    ElMessage.success('预约成功')
    reserveVisible.value = false
    await loadData()
  } catch(e) {
    ElMessage.error('预约失败')
  } finally {
    reserving.value = false
  }
}

onMounted(loadData)

// 监听项目切换事件
if (typeof window !== 'undefined') {
  window.addEventListener('project-changed', () => { loadData() })
}
</script>