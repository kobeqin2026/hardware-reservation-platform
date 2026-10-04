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

// 门户 8090 SSO 身份参数清理: Vue Router 初始导航在组件 setup 后仍会重写 URL, 故用 afterEach
// (在导航完全落定后执行) 剔除 ?user/role/display, 避免地址栏残留/误分享。身份已由 App.vue setup 同步读入 localStorage。
router.afterEach((to) => {
  try {
    const params = ['user', 'role', 'display']
    if (!params.some((p) => to.query[p] !== undefined)) return
    const u = new URL(location.href)
    let changed = false
    params.forEach((p) => { if (u.searchParams.has(p)) { u.searchParams.delete(p); changed = true } })
    if (changed) history.replaceState(null, '', u.pathname + (u.search ? u.search : '') + (u.hash || ''))
  } catch (e) {}
})

export default router