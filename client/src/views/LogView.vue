<template>
  <div class="log-view">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <span style="font-size:16px;font-weight:700;">{{ currentProject }} — 操作日志</span>
      <div style="display:flex;gap:8px;">
        <el-button size="small" @click="loadData" :icon="Refresh">刷新</el-button>
      </div>
    </div>

    <el-card shadow="never">
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span style="font-weight:600;">所有操作记录</span>
          <div style="display:flex;align-items:center;gap:8px;">
            <!-- 操作类型筛选 -->
            <el-select v-model="filterAction" placeholder="操作类型" size="small" clearable style="width:100px;">
              <el-option label="预约" value="reserve" />
              <el-option label="释放" value="release" />
              <el-option label="阶段切换" value="stage_switch" />
              <el-option label="维护" value="maintenance" />
              <el-option label="健康检查" value="health_check" />
              <el-option label="状态变更" value="status_change" />
            </el-select>
            <!-- 平台筛选 -->
            <el-input
              v-model="filterPlatform" placeholder="平台ID" size="small" clearable
              style="width:100px;" @clear="loadData"
            />
            <!-- 团队筛选 -->
            <el-select v-model="filterTeam" placeholder="团队" size="small" clearable style="width:100px;">
              <el-option v-for="t in allTeams" :key="t.id" :label="t.display_name" :value="t.id" />
            </el-select>
            <!-- 日期范围 -->
            <el-date-picker
              v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始"
              end-placeholder="结束" size="small" style="width:220px;" value-format="YYYY-MM-DD"
              :clearable="true"
            />
          </div>
        </div>
      </template>

      <el-table :data="filteredLogs" stripe size="small" max-height="600" v-loading="loading">
        <el-table-column prop="created_at" label="时间" width="170" />
        <el-table-column label="平台" width="80">
          <template #default="{row}">
            <el-tag size="small">{{ row.platform_id }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{row}">
            <el-tag
              :type="logActionType(row.action)"
              size="small"
            >
              {{ actionLabel(row.action) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="team_name" label="团队" width="120" />
        <el-table-column prop="owner" label="负责人" width="100" />
        <el-table-column prop="detail" label="详情" min-width="200" show-overflow-tooltip />
      </el-table>

      <!-- 分页 -->
      <div style="display:flex;justify-content:flex-end;margin-top:12px;">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="totalLogs"
          :page-sizes="[50, 100, 200]"
          layout="total, sizes, prev, pager, next"
          @size-change="loadData"
          @current-change="loadData"
          small
        />
      </div>
    </el-card>

    <!-- 无数据时提示 -->
    <el-empty v-if="!loading && filteredLogs.length === 0" description="暂无操作日志" :image-size="80" style="margin-top:20px;" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getLogs } from '@/api'

const currentProject = inject('currentProject', ref('BR2x6'))
const logs = ref([])
const allTeams = ref([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(50)
const totalLogs = ref(0)

// 筛选条件
const filterAction = ref('')
const filterPlatform = ref('')
const filterTeam = ref('')
const dateRange = ref(null)

function logActionType(a) {
  const map = {
    reserve: 'warning',
    release: 'success',
    stage_switch: 'primary',
    maintenance: 'info',
    health_check: '',
    status_change: ''
  }
  return map[a] || 'info'
}

function actionLabel(a) {
  const map = {
    reserve: '预约',
    release: '释放',
    stage_switch: '阶段切换',
    maintenance: '维护',
    health_check: '健康检查',
    status_change: '状态变更'
  }
  return map[a] || a
}

/** 前端二次过滤 — 对后端已返回数据进行客户端过滤 */
const filteredLogs = computed(() => {
  let list = logs.value
  if (filterAction.value) {
    list = list.filter(l => l.action === filterAction.value)
  }
  if (filterPlatform.value) {
    list = list.filter(l => (l.platform_id || '').includes(filterPlatform.value))
  }
  if (filterTeam.value) {
    list = list.filter(l => l.team_name === filterTeam.value || l.team_id === filterTeam.value)
  }
  if (dateRange.value && dateRange.value.length === 2) {
    const start = dateRange.value[0]
    const end = dateRange.value[1]
    list = list.filter(l => {
      const d = (l.created_at || '').slice(0, 10)
      return d >= start && d <= end
    })
  }
  return list
})

async function loadTeams() {
  try {
    const { getOverview } = await import('@/api')
    const res = await getOverview()
    allTeams.value = res.data.teams || []
  } catch(e) {}
}

async function loadData() {
  loading.value = true
  try {
    const params = {
      limit: pageSize.value,
      offset: (currentPage.value - 1) * pageSize.value,
      project: currentProject.value
    }
    const res = await getLogs(params)
    logs.value = res.data.logs || res.data || []
    totalLogs.value = res.data.total || logs.value.length
  } catch(e) {
    ElMessage.error('加载日志失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
  loadTeams()
})

// 监听项目切换事件
if (typeof window !== 'undefined') {
  window.addEventListener('project-changed', () => {
    currentPage.value = 1
    loadData()
  })
}
</script>