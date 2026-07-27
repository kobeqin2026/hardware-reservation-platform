<template>
  <el-container class="app-container" v-if="currentUser">
    <!-- 侧边栏 -->
    <el-aside width="220px" class="app-aside">
      <div class="logo-area">
        <h2 class="logo-title">硬件资源平台</h2>
        <p class="logo-subtitle">Hardware Reservation</p>
      </div>
      <el-menu
        :default-active="route.path"
        router
        class="side-menu"
        background-color="#001529"
        text-color="#ffffffb3"
        active-text-color="#fff"
      >
        <el-menu-item index="/">
          <el-icon><Monitor /></el-icon>
          <span>总览看板</span>
        </el-menu-item>
        <el-menu-item index="/platforms">
          <el-icon><Connection /></el-icon>
          <span>平台列表</span>
        </el-menu-item>
        <el-menu-item index="/chips">
          <el-icon><Cpu /></el-icon>
          <span>芯片信息</span>
        </el-menu-item>
        <el-menu-item index="/teams">
          <el-icon><UserFilled /></el-icon>
          <span>团队分配</span>
        </el-menu-item>
        <el-menu-item index="/stage-plan">
          <el-icon><Calendar /></el-icon>
          <span>阶段规划</span>
        </el-menu-item>
        <el-menu-item index="/logs">
          <el-icon><List /></el-icon>
          <span>操作日志</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <!-- 顶部 -->
      <el-header class="app-header">
        <div class="header-left">
          <span style="font-size:13px;color:#909399;margin-right:6px;">项目</span>
          <el-select v-model="currentProject" size="small" style="width:140px;" @change="handleProjectSwitch">
            <el-option v-for="p in allProjects" :key="p" :label="p" :value="p" />
          </el-select>
          <el-button v-if="currentUser.role === 'admin'" size="small" text type="primary" @click="showNewProjectDialog = true" style="margin-left:6px;">
            + 新建
          </el-button>
          <el-button v-if="currentUser.role === 'admin' && allProjects.length > 1" size="small" text type="danger" @click="handleDeleteProject">
            删除
          </el-button>
        </div>
        <div class="header-right">
          <span style="font-size:12px;color:#999;margin-right:12px;">{{ currentUser.name }}</span>
          <el-button text @click="handleLogout" style="color:#F56C6C;">退出</el-button>
          <el-button text @click="refreshAll" :icon="Refresh" :loading="refreshing">刷新</el-button>
        </div>
      </el-header>

      <!-- 主体 -->
      <el-main class="app-main">
        <router-view :key="route.fullPath" />
      </el-main>
    </el-container>
  </el-container>
  <!-- 未登录 -->
  <div v-else style="display:flex;align-items:center;justify-content:center;height:100vh;">
    <div style="text-align:center;">
      <span style="font-size:20px;font-weight:600;color:#909399;display:block;margin-bottom:16px;">硬件资源预约平台</span>
      <el-button type="primary" size="large" @click="showLogin = true">请登录</el-button>
      <el-dialog v-model="showLogin" title="登录" width="350px" :close-on-click-modal="false">
        <el-form ref="loginFormRef" :model="loginForm" label-width="70px" @keyup.enter="doLogin">
          <el-form-item label="用户名">
            <el-input v-model="loginForm.name" placeholder="用户名" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="loginForm.password" type="password" placeholder="密码" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button type="primary" @click="doLogin" :loading="logining">登录</el-button>
        </template>
      </el-dialog>
    </div>
  </div>

  <!-- 项目选择对话框（登录后） -->
  <el-dialog v-model="showProjectPicker" title="选择项目" width="380px" :close-on-click-modal="false" :close-on-press-escape="false">
    <div style="text-align:center;padding:16px 0;">
      <div style="font-size:14px;color:#606266;margin-bottom:16px;">请选择要进入的项目</div>
      <el-select v-model="tempProject" size="large" style="width:260px;" placeholder="选择项目">
        <el-option v-for="p in allProjects" :key="p" :label="p" :value="p" />
      </el-select>
    </div>
    <template #footer>
      <el-button type="primary" size="large" @click="confirmProject" style="width:100%;">进入项目</el-button>
    </template>
  </el-dialog>

  <!-- 新建项目对话框 -->
  <el-dialog v-model="showNewProjectDialog" title="新建项目" width="450px">
    <el-form :model="newProjectForm" label-width="90px">
      <el-form-item label="项目名称">
        <el-input v-model="newProjectForm.name" placeholder="例如: BR200" />
      </el-form-item>
      <el-form-item label="复制来源">
        <el-select v-model="newProjectForm.copyFrom" filterable style="width:100%" placeholder="选择已有项目（可选）">
          <el-option label="不复制，创建空项目" value="" />
          <el-option v-for="p in allProjects" :key="p" :label="p" :value="p" />
        </el-select>
      </el-form-item>
      <div v-if="newProjectForm.copyFrom" style="font-size:12px;color:#999;padding-left:90px;margin-top:-8px;">
        将从 {{ newProjectForm.copyFrom }} 复制所有平台和配置
      </div>
    </el-form>
    <template #footer>
      <el-button @click="showNewProjectDialog = false">取消</el-button>
      <el-button type="primary" @click="handleCreateProject" :loading="creatingProject">创建</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, onMounted, provide } from 'vue'
import { useRoute } from 'vue-router'
import { Refresh, Cpu } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getStages, login, getProjects, createProject, copyProject, deleteProject } from '@/api'

const route = useRoute()
const refreshing = ref(false)
const currentStage = ref('BU')
const stages = ref([])
const stageNames = { 'BU': 'Bring Up', 'FE': 'Feature Enable', 'FST': 'Feature Stress Test', 'PVT': 'PVT Validation' }

// ---- 登录 ----
const savedUser = localStorage.getItem('hw_reservation_user')
const currentUser = ref(savedUser ? JSON.parse(savedUser) : null)
const showLogin = ref(false)
const logining = ref(false)
const loginForm = ref({ name: '', password: '' })

async function doLogin() {
  if (!loginForm.value.name || !loginForm.value.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  logining.value = true
  try {
    const res = await login(loginForm.value.name, loginForm.value.password)
    const user = res.data.user
    currentUser.value = { name: user.name, role: user.role, display_name: user.display_name }
    localStorage.setItem('hw_reservation_user', JSON.stringify(currentUser.value))
    showLogin.value = false
    ElMessage.success(`欢迎，${user.display_name || user.name}`)
    loginForm.value = { name: '', password: '' }
    // 登录后加载项目列表并弹出项目选择
    await loadProjects()
    if (allProjects.value.length > 1) {
      showProjectPicker.value = true
    }
  } catch(e) {
    ElMessage.error(e.response?.data?.error || '登录失败')
  } finally {
    logining.value = false
  }
}

function handleLogout() {
  currentUser.value = null
  localStorage.removeItem('hw_reservation_user')
  ElMessage.info('已退出')
}

const currentStageName = computed(() => {
  const s = stages.value.find(x => x.id === currentStage.value)
  return s ? `${s.name}` : currentStage.value
})

const stageTagType = computed(() => {
  const map = { 'BU': 'danger', 'FE': 'warning', 'FST': 'primary', 'PVT': 'success' }
  return map[currentStage.value] || 'info'
})

async function loadStage() {
  try {
    const res = await getStages()
    stages.value = res.data.stages
    currentStage.value = res.data.currentStage
  } catch(e) { console.error(e) }
}

async function refreshAll() {
  refreshing.value = true
  await loadStage()
  setTimeout(() => { refreshing.value = false }, 300)
}

// ---- 项目管理 ----
const allProjects = ref(['BR2x6'])
const currentProject = ref('BR2x6')
const showNewProjectDialog = ref(false)
const creatingProject = ref(false)
const newProjectForm = ref({ name: '', copyFrom: '' })
const showProjectPicker = ref(false)
const tempProject = ref('')

provide('currentProject', currentProject)

async function loadProjects() {
  try {
    const res = await getProjects()
    const list = res.data.projects || []
    if (list.length) allProjects.value = list
    // 确保 currentProject 在列表中
    if (!allProjects.value.includes(currentProject.value)) {
      currentProject.value = allProjects.value[0]
    }
  } catch(e) { console.error(e) }
}

function handleProjectSwitch(proj) {
  currentProject.value = proj
  localStorage.setItem('hw_reservation_project', proj)
  ElMessage.info(`已切换到 ${proj} 项目`)
  // 强制所有子页面刷新数据
  window.dispatchEvent(new CustomEvent('project-changed', { detail: proj }))
}

function confirmProject() {
  if (!tempProject.value) { ElMessage.warning('请选择项目'); return }
  currentProject.value = tempProject.value
  localStorage.setItem('hw_reservation_project', tempProject.value)
  showProjectPicker.value = false
  ElMessage.success(`已进入 ${tempProject.value} 项目`)
}

async function handleCreateProject() {
  const name = newProjectForm.value.name.trim()
  if (!name) { ElMessage.warning('请输入项目名称'); return }
  creatingProject.value = true
  try {
    await createProject(name)
    const copyFrom = newProjectForm.value.copyFrom
    if (copyFrom) {
      ElMessage.info(`正在从 ${copyFrom} 复制平台数据...`)
      await copyProject(copyFrom, name)
    }
    ElMessage.success(`项目 ${name} 已创建${copyFrom ? '（已复制数据）' : ''}`)
    showNewProjectDialog.value = false
    newProjectForm.value = { name: '', copyFrom: '' }
    await loadProjects()
    currentProject.value = name
    localStorage.setItem('hw_reservation_project', name)
  } catch(e) {
    ElMessage.error('创建失败：' + (e.response?.data?.error || e.message))
  } finally {
    creatingProject.value = false
  }
}

async function handleDeleteProject() {
  const proj = currentProject.value
  try {
    await ElMessageBox.confirm(
      `确定删除项目 ${proj}？此操作将删除该项目下的所有平台、预约记录和芯片数据，不可恢复。`,
      '确认删除项目',
      { confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'warning' }
    )
    await deleteProject(proj)
    ElMessage.success(`项目 ${proj} 已删除`)
    await loadProjects()
    // 切换到第一个项目
    if (allProjects.value.length) {
      currentProject.value = allProjects.value[0]
      localStorage.setItem('hw_reservation_project', allProjects.value[0])
    }
  } catch(e) {
    if (e !== 'cancel') ElMessage.error('删除失败：' + (e.response?.data?.error || e.message))
  }
}

onMounted(() => {
  loadStage()
  loadProjects()
  // 从 localStorage 恢复之前选中的项目
  const saved = localStorage.getItem('hw_reservation_project')
  if (saved) currentProject.value = saved
})
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #app { height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: #f0f2f5; }

.app-container { height: 100vh; }

.app-aside {
  background: #001529;
  overflow: hidden;
}

.logo-area {
  height: 100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

.logo-title {
  color: #fff;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 1px;
}

.logo-subtitle {
  color: rgba(255,255,255,0.45);
  font-size: 11px;
  margin-top: 4px;
}

.side-menu { border-right: none !important; }

.app-header {
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e8e8e8;
  padding: 0 24px;
  height: 56px;
}

.app-main {
  background: #f0f2f5;
  padding: 16px;
  overflow-y: auto;
}
</style>