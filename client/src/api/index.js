import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
})

export function getOverview() {
  return api.get('/reservations/overview')
}

export function getStats(params) {
  return api.get('/dashboard/stats', { params })
}

export function getStages() {
  return api.get('/stages')
}

export function updateStage(id, data) {
  return api.put(`/stages/${id}`, data)
}

export function switchStage(stageId) {
  return api.post('/stages/switch', { stageId })
}

export function getTeamAllocations(teamId) {
  return api.get(`/teams/${teamId}/allocations`)
}

export function getStageOverview() {
  return api.get('/teams/stage-overview')
}

export function getProjects() {
  return api.get('/projects')
}

export function createProject(project) {
  return api.post('/projects', { project })
}

export function copyProject(fromProject, toProject) {
  return api.post('/projects/copy', { fromProject, toProject })
}

export function deleteProject(project) {
  return api.delete(`/projects/${encodeURIComponent(project)}`)
}

export function getPlatforms() {
  return api.get('/platforms')
}

export function getPlatformDetail(id) {
  return api.get(`/platforms/${id}`)
}

export function updatePlatformStatus(id, status, detail) {
  return api.patch(`/platforms/${id}/status`, { status, detail })
}

export function updatePlatformConfig(id, config) {
  return api.patch(`/platforms/${id}/config`, { config })
}

export function allocatePlatformTeams(id, teamIds) {
  return api.put(`/platforms/${id}/allocate-teams`, { teamIds })
}

export function reservePlatform(teamId, platformId, purpose, owner) {
  return api.post('/reservations/reserve', { teamId, platformId, purpose, owner })
}

export function releaseReservation(reservationId) {
  return api.post('/reservations/release', { reservationId })
}

export function getLogs(params) {
  return api.get('/reservations/logs', { params })
}

export function login(name, password) {
  return api.post('/users/login', { name, password })
}

export function getStageComparison() {
  return api.get('/dashboard/stage-comparison')
}

// ---- Chip API ----
export function getChips(platformId) {
  return api.get('/chips', { params: { platformId } })
}

export function getAllChips() {
  return api.get('/chips')
}

export function getChipDetail(id) {
  return api.get(`/chips/${id}`)
}

export function createChip(data) {
  return api.post('/chips', data)
}

export function updateChip(id, data) {
  return api.put(`/chips/${id}`, data)
}

export function deleteChip(id) {
  return api.delete(`/chips/${id}`)
}

export default api