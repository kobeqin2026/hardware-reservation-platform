<template>
  <div class="chip-view">
    <el-card shadow="never">
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-weight:600;">芯片信息管理 — {{ currentProject }}</span>
          <el-button type="primary" size="small" @click="handleAdd" :icon="Plus">新增芯片</el-button>
        </div>
      </template>

      <!-- 搜索过滤栏 -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
        <el-input
          v-model="searchQuery" placeholder="搜索ASIC ID/UUID/备注" size="small"
          clearable style="width:260px;" :prefix-icon="Search"
        />
        <el-select v-model="filterPlatform" placeholder="按平台筛选" size="small" clearable style="width:150px;">
          <el-option label="未分配" value="__unassigned__" />
          <el-option v-for="p in platforms" :key="p.id" :label="p.label" :value="p.id" />
        </el-select>
      </div>

      <el-table :data="filteredChips" stripe size="small" v-loading="loading">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="所属平台" width="100">
          <template #default="{row}">
            <el-tag v-if="row.platform_label" size="small">{{ row.platform_label }}</el-tag>
            <el-tag v-else size="small" type="warning">未分配</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="asic_id" label="ASIC ID" width="200" show-overflow-tooltip />
        <el-table-column prop="uuid" label="UUID" width="200" show-overflow-tooltip />
        <el-table-column prop="mbist_result" label="MBist result" width="120">
          <template #default="{row}">
            <el-tag :type="row.mbist_result === 'pass' ? 'success' : row.mbist_result === 'fail' ? 'danger' : 'info'" size="small">{{ row.mbist_result || '未测' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="ft_status" label="FT status" width="120">
          <template #default="{row}">
            <el-tag :type="row.ft_status === 'pass' ? 'success' : row.ft_status === 'fail' ? 'danger' : 'info'" size="small">{{ row.ft_status || '未测' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="slt_status" label="SLT status" width="120">
          <template #default="{row}">
            <el-tag :type="row.slt_status === 'pass' ? 'success' : row.slt_status === 'fail' ? 'danger' : 'info'" size="small">{{ row.slt_status || '未测' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
        <el-table-column label="操作" width="200">
          <template #default="{row}">
            <div style="display:flex;gap:4px;">
              <el-button size="small" @click="handleEdit(row)">编辑</el-button>
              <el-button size="small" @click="handleAssignPlatform(row)" :disabled="!!row.platform_id">分配平台</el-button>
              <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑芯片' : '新增芯片'" width="550px">
      <el-form :model="chipForm" label-width="110px">
        <el-form-item label="所属平台">
          <el-select v-model="chipForm.platformId" filterable clearable style="width:100%" placeholder="选择平台（可选）">
            <el-option label="未分配" value="" />
            <el-option v-for="p in projectPlatforms" :key="p.id" :label="p.label" :value="p.id" />
          </el-select>
          <div style="font-size:11px;color:#999;margin-top:2px;">留空表示暂不分配平台，可后期编辑时选择</div>
        </el-form-item>
        <el-form-item label="ASIC ID">
          <el-input v-model="chipForm.asicId" placeholder="ASIC ID" />
        </el-form-item>
        <el-form-item label="UUID">
          <el-input v-model="chipForm.uuid" placeholder="芯片UUID" />
        </el-form-item>
        <el-form-item label="MBist result">
          <el-select v-model="chipForm.mbistResult" style="width:100%" placeholder="MBist测试结果">
            <el-option label="未测" value="" />
            <el-option label="pass" value="pass" />
            <el-option label="fail" value="fail" />
          </el-select>
        </el-form-item>
        <el-form-item label="FT status">
          <el-select v-model="chipForm.ftStatus" style="width:100%" placeholder="FT状态">
            <el-option label="未测" value="" />
            <el-option label="pass" value="pass" />
            <el-option label="fail" value="fail" />
          </el-select>
        </el-form-item>
        <el-form-item label="SLT status">
          <el-select v-model="chipForm.sltStatus" style="width:100%" placeholder="SLT状态">
            <el-option label="未测" value="" />
            <el-option label="pass" value="pass" />
            <el-option label="fail" value="fail" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="chipForm.remark" type="textarea" :rows="2" placeholder="备注信息" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">{{ isEdit ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>

    <!-- 分配平台对话框 -->
    <el-dialog v-model="assignVisible" title="分配平台" width="400px">
      <el-form :model="assignForm" label-width="80px">
        <el-form-item label="芯片">
          <el-input :model-value="assignChipLabel" disabled />
        </el-form-item>
        <el-form-item label="所属平台">
          <el-select v-model="assignForm.platformId" filterable style="width:100%" placeholder="选择平台">
            <el-option label="未分配" value="" />
            <el-option v-for="p in projectPlatforms" :key="p.id" :label="p.label" :value="p.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignVisible = false">取消</el-button>
        <el-button type="primary" @click="doAssign" :loading="assigning">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { Plus, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getAllChips, createChip, updateChip, deleteChip, getPlatforms } from '@/api'
import api from '@/api'

const currentProject = inject('currentProject', ref('BR2x6'))
const chips = ref([])
const platforms = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const saving = ref(false)
const isEdit = ref(false)
const editId = ref(null)

// 搜索/过滤状态
const searchQuery = ref('')
const filterPlatform = ref('')

const chipForm = ref({
  platformId: '',
  asicId: '',
  uuid: '',
  mbistResult: '',
  ftStatus: '',
  sltStatus: '',
  remark: ''
})

const showAddDialog = ref(false)

// 分配平台对话框
const assignVisible = ref(false)
const assignChipId = ref(null)
const assignChipLabel = ref('')
const assignForm = ref({ platformId: '' })
const assigning = ref(false)

/** 当前项目下的平台列表 */
const projectPlatforms = computed(() =>
  platforms.value.filter(p => (p.project || 'BR2x6') === currentProject.value)
)

/** 按项目过滤后的芯片 + 搜索/筛选 */
const filteredChips = computed(() => {
  let list = chips.value.filter(c => c.project === currentProject.value ||
    projectPlatforms.value.some(p => p.id === c.platform_id) ||
    !c.platform_id)  // also show unassigned chips
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(c =>
      (c.asic_id || '').toLowerCase().includes(q) ||
      (c.uuid || '').toLowerCase().includes(q) ||
      (c.remark || '').toLowerCase().includes(q)
    )
  }
  if (filterPlatform.value === '__unassigned__') {
    list = list.filter(c => !c.platform_id)
  } else if (filterPlatform.value) {
    list = list.filter(c => c.platform_id === filterPlatform.value)
  }
  return list
})

async function loadChips() {
  loading.value = true
  try {
    const res = await getAllChips()
    chips.value = res.data || []
  } catch(e) {
    ElMessage.error('加载芯片数据失败')
  } finally {
    loading.value = false
  }
}

async function loadPlatforms() {
  try {
    const res = await getPlatforms()
    platforms.value = res.data.platforms || []
  } catch(e) {}
}

function handleEdit(row) {
  isEdit.value = true
  editId.value = row.id
  chipForm.value = {
    platformId: row.platform_id || '',
    asicId: row.asic_id || '',
    uuid: row.uuid || '',
    mbistResult: row.mbist_result || '',
    ftStatus: row.ft_status || '',
    sltStatus: row.slt_status || '',
    remark: row.remark || ''
  }
  dialogVisible.value = true
}

function handleAdd() {
  isEdit.value = false
  editId.value = null
  chipForm.value = { platformId: '', asicId: '', uuid: '', mbistResult: '', ftStatus: '', sltStatus: '', remark: '' }
  dialogVisible.value = true
}

async function handleSave() {
  saving.value = true
  try {
    if (isEdit.value) {
      await updateChip(editId.value, chipForm.value)
      ElMessage.success('芯片信息已更新')
    } else {
      await createChip(chipForm.value)
      ElMessage.success('芯片已添加')
    }
    dialogVisible.value = false
    await loadChips()
  } catch(e) {
    ElMessage.error('保存失败：' + (e.response?.data?.error || e.message))
  } finally {
    saving.value = false
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(`确定删除芯片 ${row.asic_id || row.uuid || '#'+row.id} ？`, '确认删除')
    await deleteChip(row.id)
    ElMessage.success('已删除')
    await loadChips()
  } catch(e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

/** 分配平台 */
function handleAssignPlatform(row) {
  assignChipId.value = row.id
  assignChipLabel.value = row.asic_id || row.uuid || '#'+row.id
  assignForm.value = { platformId: '' }
  assignVisible.value = true
}

async function doAssign() {
  if (!assignForm.value.platformId) {
    ElMessage.warning('请选择平台')
    return
  }
  assigning.value = true
  try {
    await updateChip(assignChipId.value, { platformId: assignForm.value.platformId })
    ElMessage.success('平台已分配')
    assignVisible.value = false
    await loadChips()
  } catch(e) {
    ElMessage.error('分配失败：' + (e.response?.data?.error || e.message))
  } finally {
    assigning.value = false
  }
}

onMounted(() => {
  loadChips()
  loadPlatforms()
})

// 监听项目切换事件
if (typeof window !== 'undefined') {
  window.addEventListener('project-changed', () => {
    loadChips()
    loadPlatforms()
  })
}
</script>