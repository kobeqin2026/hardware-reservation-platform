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
          v-model="searchQuery" placeholder="搜索芯片序列号/型号/备注" size="small"
          clearable style="width:240px;" :prefix-icon="Search"
        />
        <el-select v-model="filterPlatform" placeholder="按平台筛选" size="small" clearable style="width:150px;">
          <el-option v-for="p in platforms" :key="p.id" :label="p.label" :value="p.id" />
        </el-select>
        <el-select v-model="filterStatus" placeholder="按状态筛选" size="small" clearable style="width:120px;">
          <el-option label="空闲" value="idle" />
          <el-option label="测试中" value="testing" />
          <el-option label="已完成" value="done" />
          <el-option label="失败" value="failed" />
        </el-select>
      </div>

      <el-table :data="filteredChips" stripe size="small" v-loading="loading">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="所属平台" width="110">
          <template #default="{row}">
            <el-tag size="small">{{ row.platform_label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="slot" label="槽位" width="90" />
        <el-table-column prop="serial" label="序列号" width="180" />
        <el-table-column prop="type" label="芯片型号" width="140" />
        <el-table-column label="状态" width="100">
          <template #default="{row}">
            <el-tag :type="chipStatusType(row.status)" size="small">{{ chipStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
        <el-table-column label="操作" width="160">
          <template #default="{row}">
            <el-button size="small" @click="handleEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑芯片' : '新增芯片'" width="500px">
      <el-form :model="chipForm" label-width="90px">
        <el-form-item label="所属平台">
          <el-select v-model="chipForm.platformId" filterable style="width:100%" placeholder="选择平台" :disabled="isEdit">
            <el-option v-for="p in projectPlatforms" :key="p.id" :label="p.label" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="槽位">
          <el-input v-model="chipForm.slot" placeholder="例如: Slot0, Slot1" />
        </el-form-item>
        <el-form-item label="序列号">
          <el-input v-model="chipForm.serial" placeholder="芯片序列号/SN" />
        </el-form-item>
        <el-form-item label="芯片型号">
          <el-input v-model="chipForm.type" placeholder="例如: BR200-768, BR200-132" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="chipForm.status" style="width:100%">
            <el-option label="空闲" value="idle" />
            <el-option label="测试中" value="testing" />
            <el-option label="已完成" value="done" />
            <el-option label="失败" value="failed" />
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { Plus, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getAllChips, createChip, updateChip, deleteChip, getPlatforms } from '@/api'

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
const filterStatus = ref('')

const chipForm = ref({
  platformId: '',
  slot: '',
  serial: '',
  type: '',
  status: 'idle',
  remark: ''
})

const showAddDialog = ref(false)

/** 当前项目下的平台列表 */
const projectPlatforms = computed(() =>
  platforms.value.filter(p => (p.project || 'BR2x6') === currentProject.value)
)

/** 按项目过滤后的芯片 + 搜索/筛选 */
const filteredChips = computed(() => {
  let list = chips.value.filter(c => c.project === currentProject.value ||
    projectPlatforms.value.some(p => p.id === c.platform_id))
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(c =>
      (c.serial || '').toLowerCase().includes(q) ||
      (c.type || '').toLowerCase().includes(q) ||
      (c.remark || '').toLowerCase().includes(q)
    )
  }
  if (filterPlatform.value) {
    list = list.filter(c => c.platform_id === filterPlatform.value)
  }
  if (filterStatus.value) {
    list = list.filter(c => c.status === filterStatus.value)
  }
  return list
})

function chipStatusType(st) {
  const map = { idle: 'info', testing: 'warning', done: 'success', failed: 'danger' }
  return map[st] || 'info'
}

function chipStatusLabel(st) {
  const map = { idle: '空闲', testing: '测试中', done: '已完成', failed: '失败' }
  return map[st] || st
}

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
    platformId: row.platform_id,
    slot: row.slot,
    serial: row.serial,
    type: row.type,
    status: row.status,
    remark: row.remark
  }
  dialogVisible.value = true
}

function handleAdd() {
  isEdit.value = false
  editId.value = null
  chipForm.value = { platformId: '', slot: '', serial: '', type: '', status: 'idle', remark: '' }
  dialogVisible.value = true
}

async function handleSave() {
  if (!chipForm.value.platformId) {
    ElMessage.warning('请选择所属平台')
    return
  }
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
    await ElMessageBox.confirm(`确定删除芯片 ${row.serial || '#'+row.id} ？`, '确认删除')
    await deleteChip(row.id)
    ElMessage.success('已删除')
    await loadChips()
  } catch(e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
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