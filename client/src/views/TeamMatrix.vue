<template>
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
        <!-- 颜色标签始终显示（覆盖lay） -->
        <div v-if="gridData[p.id+'_'+i]" class="ct" :style="cellStyle(gridData[p.id+'_'+i])" style="position:absolute;top:0;left:0;right:0;bottom:0;z-index:1;display:flex;align-items:center;justify-content:center;overflow:hidden;">
          {{ teamName(gridData[p.id+'_'+i]) }}
        </div>
        <!-- 编辑模式：下拉框在颜色标签上方 -->
        <el-select v-if="adminEditable" :modelValue="gridData[p.id+'_'+i]" size="small" style="width:100%;min-width:70px;position:relative;z-index:2;opacity:0.85;" placeholder="-" clearable
          @update:modelValue="val => $emit('cellChange', {platformId:p.id, date:d, teamId:val})">
          <el-option v-for="t in domainTeams" :key="t.id" :label="t.display_name" :value="t.id" />
        </el-select>
      </div>
    </div>
  </div>
</template>

<script setup>
const TEAM_COLORS = [
  '#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#909399',
  '#B37FEB', '#36CFC9', '#F2A900', '#E84393', '#00B894',
  '#6C5CE7', '#FD79A8', '#00CEC9', '#A29BFE', '#FDCB6E',
  '#E17055', '#74B9FF', '#55EFC4'
]

const props = defineProps({
  dayRange: Array,
  platforms: Array,
  adminEditable: { type: Boolean, default: false },
  domainTeams: { type: Array, default: () => [] },
  gridData: { type: Object, default: () => ({}) }
})
defineEmits(['cellChange'])

function teamName(id) {
  const t = props.domainTeams.find(x => x.id === id)
  return t ? t.display_name || t.id : id
}

function cellStyle(teamId) {
  const idx = (teamId || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const c = TEAM_COLORS[idx % TEAM_COLORS.length]
  return { background: c + '22', color: c, border: '1px solid ' + c + '44', borderRadius: '3px', padding: '1px 4px', fontWeight: 600, fontSize: '10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }
}
</script>

<style scoped>
.mx { width: 100%; font-size: 12px; }
.mx-hdr { display: flex; border-bottom: 2px solid #ddd; background: #fafafa; }
.mx-row { display: flex; border-bottom: 1px solid #f0f0f0; min-height: 44px; }
.mx-lbl { width: 60px; min-width: 60px; max-width: 60px; display: flex; align-items: center; padding: 4px 6px; font-weight:600; font-size:12px; }
.mx-d { flex: 1; text-align: center; border-right: 1px solid #f0f0f0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 44px; padding: 1px; position:relative; overflow:hidden; }
.mx-hdr .mx-d { background: #fafafa; min-height: 36px; }
.dn { font-size:11px; line-height:1.3; }
.dw { color:#999; font-size:9px; }
</style>