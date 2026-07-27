import { createRouter, createWebHistory } from 'vue-router'

import Dashboard from '@/views/Dashboard.vue'
import PlatformView from '@/views/PlatformView.vue'
import TeamView from '@/views/TeamView.vue'
import StagePlan from '@/views/StagePlan.vue'
import LogView from '@/views/LogView.vue'
import ChipInfo from '@/views/ChipInfo.vue'

const routes = [
  { path: '/', name: 'Dashboard', component: Dashboard, meta: { title: '总览' } },
  { path: '/platforms', name: 'Platforms', component: PlatformView, meta: { title: '平台列表' } },
  { path: '/chips', name: 'Chips', component: ChipInfo, meta: { title: '芯片信息' } },
  { path: '/teams', name: 'Teams', component: TeamView, meta: { title: '团队分配' } },
  { path: '/stage-plan', name: 'StagePlan', component: StagePlan, meta: { title: '阶段规划' } },
  { path: '/logs', name: 'Logs', component: LogView, meta: { title: '操作日志' } }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router