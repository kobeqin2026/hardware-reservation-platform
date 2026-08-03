<template>
  <div class="platform-view">
    <el-card shadow="never">
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-weight:600;">平台列表 & 详情</span>
          <div style="display:flex;align-items:center;gap:8px;">
            <el-dropdown v-if="isAdmin" @command="handleNewPlatform">
              <el-button size="small" type="success" :icon="Plus">新增平台</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="new">新建平台</el-dropdown-item>
                  <el-dropdown-item command="copy">从已有平台复制</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </template>

      <el-table :data="sortedPlatforms" stripe size="small" style="width:100%;">
        <el-table-column prop="label" label="平台" width="70" />
        <el-table-column label="类型" width="100">
          <template #default="{row}">
            <el-select v-if="isAdmin && row._editing" v-model="row._type" size="small" style="width:88px;">
              <el-option label="Socket" value="socket" />
              <el-option label="Solder Down" value="solder_down" />
            </el-select>
            <el-tag v-else :type="row.type === 'socket' ? 'primary' : 'warning'" size="small">{{ row.type === 'socket' ? 'Socket' : 'Solder Down' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="ASIC ID" min-width="140" show-overflow-tooltip>
          <template #default="{row}">
            <el-select v-if="isAdmin && row._editing" v-model="row._asic_id" size="small" style="width:100%;" placeholder="选择 ASIC ID" clearable>
              <el-option v-for="c in (row.chips || [])" :key="c.asic_id" :label="c.asic_id" :value="c.asic_id" />
            </el-select>
            <div v-else-if="row._boundChips && row._boundChips.length" style="line-height:1.5;">
              <div v-for="c in row._boundChips" :key="c.asic_id" style="font-size:11px;">{{ c.asic_id }}</div>
            </div>
            <span v-else style="color:#ccc;">-</span>
          </template>
        </el-table-column>
        <el-table-column label="实验室位置" width="120">
          <template #default="{row}">
            <el-select v-if="isAdmin && row._editing" v-model="row._location" size="small" style="width:105px;">
              <el-option label="三楼" value="三楼" />
              <el-option label="十楼" value="十楼" />
              <el-option label="健康城" value="健康城" />
            </el-select>
            <el-tag v-else size="small" style="border:none;">{{ row.location || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="主板" width="120">
          <template #default="{row}">
            <el-input v-if="isAdmin && row._editing" v-model="row._motherboard" size="small" placeholder="主板/CPU" />
            <span v-else>{{ row.config?.motherboard || row.config?.cpu || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="OS 信息" min-width="200">
          <template #default="{row}">
            <template v-if="isAdmin && row._editing">
              <el-input v-model="row._os_ip" size="small" placeholder="IP" style="width:100%;margin-bottom:2px;" />
              <el-input v-model="row._os" size="small" placeholder="OS" style="width:100%;margin-bottom:2px;" />
              <el-input v-model="row._os_user" size="small" placeholder="用户" style="width:48%;margin-right:2%;" />
              <el-input v-model="row._os_pass" size="small" placeholder="密码" style="width:48%;" />
            </template>
            <div v-else-if="row.config?.os" style="line-height:1.5;font-size:11px;">
              <div style="font-family:monospace;">OS: {{ row.config.os }}</div>
              <div><span style="color:#999;">IP:</span> <span style="font-family:monospace;color:#409EFF;">{{ row.config.ip || '-' }}</span></div>
              <div><span style="color:#999;">用户/密码:</span> {{ row.config.os_user || '-' }}/{{ row.config.os_pass || '-' }}</div>
            </div>
            <span v-else style="color:#ccc;">-</span>
          </template>
        </el-table-column>
        <el-table-column label="BMC 信息" min-width="200">
          <template #default="{row}">
            <template v-if="isAdmin && row._editing">
              <el-input v-model="row._bmc_ip" size="small" placeholder="BMC IP" style="width:100%;margin-bottom:2px;" />
              <el-input v-model="row._bmc_user" size="small" placeholder="用户" style="width:48%;margin-right:2%;" />
              <el-input v-model="row._bmc_pass" size="small" placeholder="密码" style="width:48%;" />
            </template>
            <div v-else-if="row.config?.bmc_ip" style="line-height:1.5;font-size:11px;">
              <div><span style="color:#999;">IP:</span> <span style="font-family:monospace;color:#409EFF;">{{ row.config.bmc_ip }}</span></div>
              <div><span style="color:#999;">用户/密码:</span> {{ row.config.bmc_user || '-' }}/{{ row.config.bmc_pass || '-' }}</div>
            </div>
            <span v-else style="color:#ccc;">-</span>
          </template>
        </el-table-column>
        <el-table-column label="JTAG 信息" min-width="280">
          <template #default="{row}">
            <template v-if="isAdmin && row._editing">
              <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">
                <el-switch v-model="row._jtag_connected" size="small" active-text="已连接" inactive-text="未连接"
                  @change="val => { if(!val) { row._jtag_box=''; row._jtag_ip=''; } }" />
              </div>
              <div v-if="row._jtag_connected" style="display:flex;flex-direction:column;gap:2px;">
                <el-input v-model="row._jtag_box" size="small" placeholder="JTAG盒子" style="width:100%;" />
                <el-input v-model="row._jtag_ip" size="small" placeholder="JTAG IP" style="width:100%;" />
              </div>
            </template>
            <template v-else-if="isAdmin">
              <div style="display:flex;flex-direction:column;gap:2px;font-size:11px;">
                <div><span style="color:#999;">JTAG:</span> <span :style="{color: row.config?.jtag_box ? '#409EFF' : '#ccc'}">{{ row.config?.jtag_box || '未连接' }}</span></div>
                <div v-if="row.config?.jtag_box"><span style="color:#999;">IP:</span> <span style="font-family:monospace;">{{ row.config.jtag_ip || '-' }}</span></div>
              </div>
            </template>
            <div v-else-if="row.config?.jtag_box" style="line-height:1.5;font-size:11px;">
              <div><span style="color:#999;">JTAG:</span> {{ row.config.jtag_box }}</div>
              <div><span style="color:#999;">IP:</span> <span style="font-family:monospace;color:#409EFF;">{{ row.config.jtag_ip || '-' }}</span></div>
            </div>
            <span v-else style="color:#ccc;">-</span>
          </template>
        </el-table-column>
        <el-table-column label="预分配团队" min-width="180">
          <template #default="{row}">
            <div style="display:flex;flex-wrap:wrap;gap:2px;">
              <span v-if="row.allocatedTeams && row.allocatedTeams.length">
                <el-tag v-for="t in row.allocatedTeams" :key="t.team_id" size="small"
                  :style="{background: t.team_color+'22', color: t.team_color, borderColor: t.team_color+'44', margin:'2px'}">
                  {{ t.team_name }}
                </el-tag>
              </span>
              <span v-else style="color:#999;">-</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="当前活跃预约" width="120">
          <template #default="{row}">
            <span v-if="row.activeTeams && row.activeTeams.length">
              <el-tag v-for="t in row.activeTeams" :key="t.team_id" size="small"
                :style="{background: t.team_color+'22', color: t.team_color, borderColor: t.team_color+'44', margin:'2px'}">
                {{ t.team_name }}
              </el-tag>
            </span>
            <span v-else style="color:#ccc;">-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="350">
          <template #default="{row}">
            <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
              <template v-if="isAdmin && !row._editing">
                <el-button size="small" type="warning" @click="startPlatformEdit(row)">编辑</el-button>
              </template>
              <template v-if="isAdmin && row._editing">
                <el-button size="small" type="primary" @click="savePlatformEdit(row)">完成</el-button>
                <el-button size="small" @click="cancelPlatformEdit(row)">取消</el-button>
              </template>
              <el-button size="small" type="danger" v-if="isAdmin && !row._editing" @click="handleDeletePlatform(row)">删除</el-button>
              <el-select
                v-if="isAdmin && !row._editing"
                v-model="row.status"
                size="small"
                :style="{width:'100px'}"
                :loading="row._statusLoading"
                @change="(val) => handleStatusChange(row, val)"
                :class="'status-select-' + row.status"
              >
                <el-option label="空闲" value="idle" />
                <el-option label="使用中" value="in_use" />
                <el-option label="维护中" value="maintenance" />
              </el-select>
              <el-tag v-if="!isAdmin" :type="row.status === 'idle' ? 'success' : row.status === 'in_use' ? 'warning' : 'danger'" size="small">{{ {idle:'空闲',in_use:'使用中',maintenance:'维护中'}[row.status] || row.status }}</el-tag>
              <el-button size="small" type="success" @click="showQuickReserve(row)">预约</el-button>
              <el-button size="small" type="primary" @click="showDetail(row)">详情</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 平台详情对话框 -->
    <el-dialog v-model="detailVisible" :title="detailPlatform?.label + ' 详情'" width="720px">
      <template v-if="detailPlatform">
        <el-tabs type="border-card">
          <!-- 基本信息 -->
          <el-tab-pane label="基本信息">
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="平台ID">{{ detailPlatform.id }}</el-descriptions-item>
              <el-descriptions-item label="状态">
                <el-tag :type="detailPlatform.status === 'idle' ? 'success' : detailPlatform.status === 'in_use' ? 'warning' : detailPlatform.status === 'maintenance' ? 'danger' : 'info'" size="small">
                  {{ statusLabel(detailPlatform.status) }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="IP地址">
                <span style="font-family:monospace;">{{ detailConfig.ip || '-' }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="位置">
                <span>{{ detailPlatform.location || '-' }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="主板/CPU">
                {{ detailConfig.cpu || detailConfig.motherboard || '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="Memory">
                {{ detailConfig.memory || '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="Disk/存储">
                {{ detailConfig.disk || '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="操作系统">
                {{ detailConfig.os || '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="分配团队" :span="2">
                <span v-if="detailPlatform.allocatedTeams?.length">
                  <el-tag v-for="t in detailPlatform.allocatedTeams" :key="t.team_id" size="small"
                    :style="{background: t.team_color+'22', color: t.team_color, borderColor: t.team_color+'44', margin:'2px'}">
                    {{ t.team_name }}
                  </el-tag>
                </span>
                <span v-else>-</span>
              </el-descriptions-item>
              <el-descriptions-item label="备注" :span="2">
                {{ detailConfig.remark || '-' }}
              </el-descriptions-item>
            </el-descriptions>

            <!-- 操作按钮 -->
            <div style="margin-top:12px;display:flex;gap:8px;">
              <el-button size="small" type="primary" @click="showConfigEdit(detailPlatform)">编辑配置</el-button>
              <el-button size="small" type="success" @click="showQuickReserve(detailPlatform)" :disabled="detailPlatform.status==='maintenance'">
                快速预约
              </el-button>
            </div>
          </el-tab-pane>

          <!-- 芯片信息 -->
          <el-tab-pane label="芯片信息">
            <div style="margin-bottom:8px;">
              <el-button size="small" type="primary" @click="addChipForPlatform(detailPlatform.id)" :icon="Plus">添加芯片</el-button>
            </div>
            <el-table :data="detailChips" size="small" v-if="detailChips.length" style="width:100%;">
              <el-table-column label="平台" width="70">
                <template #default="{row}">
                  <span>{{ detailPlatform?.label }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="asic_id" label="ASIC ID" width="200" show-overflow-tooltip />
              <el-table-column prop="type" label="芯片型号" width="160" />
              <el-table-column label="操作" width="130">
                <template #default="{row}">
                  <el-button size="small" text type="primary" @click="editChipInDetail(row)">编辑</el-button>
                  <el-button size="small" text type="danger" @click="delChipInDetail(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="暂无芯片信息" :image-size="60" />
          </el-tab-pane>

          <!-- 预约记录 -->
          <el-tab-pane label="预约记录">
            <el-table :data="detailReservations" size="small" max-height="300">
              <el-table-column prop="team_name" label="团队" width="120" />
              <el-table-column prop="owner" label="负责人" width="100" />
              <el-table-column prop="purpose" label="用途" min-width="160" />
              <el-table-column prop="status" label="状态" width="80">
                <template #default="{row}">
                  <el-tag :type="row.status==='active'?'warning':'info'" size="small">{{ row.status==='active'?'使用中':'已完成' }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="started_at" label="开始时间" width="150" />
              <el-table-column label="结束时间" width="150">
                <template #default="{row}">
                  <span>{{ row.ended_at || '-' }}</span>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>

          <!-- 操作日志 -->
          <el-tab-pane label="操作日志">
            <el-table :data="detailLogs" size="small" max-height="300">
              <el-table-column prop="created_at" label="时间" width="160" />
              <el-table-column prop="action" label="操作" width="100" />
              <el-table-column prop="team_name" label="团队" width="100" />
              <el-table-column prop="detail" label="详情" />
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-dialog>

    <!-- 平台配置编辑对话框 -->
    <el-dialog v-model="configVisible" :title="'编辑 ' + (configPlatform?.label || '') + ' 配置'" width="500px">
      <el-form :model="configForm" label-width="90px">
        <el-form-item label="IP地址">
          <el-input v-model="configForm.ip" placeholder="例如: 192.168.1.100" />
        </el-form-item>
        <el-form-item label="位置">
          <el-input v-model="configForm.location" placeholder="例如: 实验室A-01" />
        </el-form-item>
        <el-form-item label="主板/CPU">
          <el-input v-model="configForm.cpu" placeholder="例如: Intel Xeon Gold 6426Y" />
        </el-form-item>
        <el-form-item label="Memory">
          <el-input v-model="configForm.memory" placeholder="例如: 512GB DDR5" />
        </el-form-item>
        <el-form-item label="存储">
          <el-input v-model="configForm.disk" placeholder="例如: 2TB NVMe SSD" />
        </el-form-item>
        <el-form-item label="操作系统">
          <el-input v-model="configForm.os" placeholder="例如: Ubuntu 22.04" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="configForm.remark" type="textarea" :rows="2" placeholder="补充信息" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="configVisible = false">取消</el-button>
        <el-button type="primary" @click="saveConfig" :loading="configSaving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 快速预约对话框 -->
    <el-dialog v-model="reserveVisible" title="快速预约" width="420px">
      <el-form :model="reserveForm" label-width="80px">
        <el-form-item label="平台">
          <el-input :model-value="reservePlatformRef?.label" disabled />
        </el-form-item>
        <el-form-item label="团队">
          <el-select v-model="reserveForm.teamId" filterable style="width:100%" placeholder="选择团队">
            <el-option v-for="t in teams" :key="t.id" :label="t.display_name" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-input v-model="reserveForm.owner" disabled placeholder="自动填入当前用户" />
        </el-form-item>
        <el-form-item label="用途">
          <el-input v-model="reserveForm.purpose" type="textarea" :rows="2" placeholder="测试用途描述" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reserveVisible = false">取消</el-button>
        <el-button type="primary" @click="doReserve" :loading="reserving">确定预约</el-button>
      </template>
    </el-dialog>

    <!-- 平台内添加芯片对话框 -->
    <el-dialog v-model="chipDialogVisible" :title="'为 ' + (chipPlatformLabel || '') + ' 添加芯片'" width="450px">
      <el-form :model="chipForm" label-width="80px">
        <el-form-item label="槽位">
          <el-input v-model="chipForm.slot" placeholder="例如: Slot0" />
        </el-form-item>
        <el-form-item label="序列号">
          <el-input v-model="chipForm.serial" placeholder="芯片序列号" />
        </el-form-item>
        <el-form-item label="型号">
          <el-input v-model="chipForm.type" placeholder="例如: BR200-768" />
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
          <el-input v-model="chipForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="chipDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveChipInDetail" :loading="chipSaving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 从已有平台复制对话框 -->
    <el-dialog v-model="copyDialogVisible" title="从已有平台复制" width="650px">
      <el-table :data="_copyPlatforms" stripe size="small" @row-click="handleCopySelect" highlight-current-row>
        <el-table-column prop="id" label="平台" width="80" />
        <el-table-column label="IP地址" width="130">
          <template #default="{row}">
            <span style="font-family:monospace;">{{ row.config?.ip || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="主板" width="120">
          <template #default="{row}">{{ row.config?.cpu || row.config?.motherboard || '-' }}</template>
        </el-table-column>
        <el-table-column label="Memory" width="100">
          <template #default="{row}">{{ row.config?.memory || '-' }}</template>
        </el-table-column>
        <el-table-column label="位置" width="100">
          <template #default="{row}">{{ row.config?.location || row.location || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{row}">
            <el-button size="small" type="primary" @click.stop="handleCopySelect(row)">选择</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div style="margin-top:8px;font-size:12px;color:#999;">点击行或「选择」按钮复制平台配置信息</div>
      <template #footer>
        <el-button @click="copyDialogVisible = false">取消</el-button>
      </template>
    </el-dialog>
  </div>

  <!-- 管理员：编辑预分配团队 -->
  <el-dialog v-model="teamAllocVisible" title="编辑预分配团队" width="450px">
    <el-checkbox-group v-model="teamAllocSelected">
      <el-checkbox v-for="t in teams" :key="t.id" :label="t.id" :value="t.id" style="margin:6px 8px;">
        <span :style="{color: t.color, fontWeight:500}">{{ t.display_name }}</span>
      </el-checkbox>
    </el-checkbox-group>
    <template #footer>
      <el-button @click="teamAllocVisible = false">取消</el-button>
      <el-button type="primary" @click="saveTeamAlloc" :loading="teamAllocSaving">保存</el-button>
    </template>
  </el-dialog>

  <!-- 管理员：用户管理 -->
  <div v-if="isAdmin" class="platform-view" style="margin-top:16px;">
    <el-card shadow="never">
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-weight:600;">用户管理</span>
          <el-button size="small" type="primary" :icon="Plus" @click="showAddUserDialog = true">添加用户</el-button>
        </div>
      </template>
      <el-table :data="allUsers" stripe size="small">
        <el-table-column prop="display_name" label="用户名" width="120" />
        <el-table-column prop="name" label="登录名" width="120" />
        <el-table-column label="角色" width="120">
          <template #default="{row}">
            <el-tag :type="row.role === 'admin' ? 'danger' : 'success'" size="small">{{ row.role === 'admin' ? '管理员' : 'Domain Owner' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template #default="{row}">
            <el-button size="small" type="primary" @click="showEditUser(row)" :disabled="row.name === 'admin'">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDeleteUser(row)" :disabled="row.name === 'admin'">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 添加用户对话框 -->
    <el-dialog v-model="showAddUserDialog" title="添加用户" width="400px">
      <el-form :model="addUserForm" label-width="80px">
        <el-form-item label="登录名">
          <el-input v-model="addUserForm.name" placeholder="登录名" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="addUserForm.password" type="password" placeholder="密码" />
        </el-form-item>
        <el-form-item label="显示名">
          <el-input v-model="addUserForm.display_name" placeholder="显示名称" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="addUserForm.role" style="width:100%">
            <el-option label="Domain Owner" value="owner" />
            <el-option label="管理员" value="admin" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddUserDialog = false">取消</el-button>
        <el-button type="primary" @click="handleAddUser" :loading="addingUser">添加</el-button>
      </template>
    </el-dialog>
    <!-- 编辑用户对话框 -->
    <el-dialog v-model="showEditUserDialog" title="编辑用户" width="400px">
      <el-form :model="editUserForm" label-width="80px">
        <el-form-item label="登录名">
          <el-input v-model="editUserForm.name" disabled />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="editUserForm.password" type="password" placeholder="留空则不修改密码" />
        </el-form-item>
        <el-form-item label="显示名">
          <el-input v-model="editUserForm.display_name" placeholder="显示名称" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="editUserForm.role" style="width:100%">
            <el-option label="Domain Owner" value="owner" />
            <el-option label="管理员" value="admin" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditUserDialog = false">取消</el-button>
        <el-button type="primary" @click="handleEditUser" :loading="editingUser">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'
import { getPlatforms, getPlatformDetail, updatePlatformStatus, updatePlatformConfig, reservePlatform, getStages, createChip, updateChip, deleteChip } from '@/api'

const currentProject = inject('currentProject', ref('BR288Y'))

const platforms = ref([])
const currentStage = ref('')
const teams = ref([])

/** 判断当前用户是否为管理员 */
const isAdmin = computed(() => {
  const u = localStorage.getItem('hw_reservation_user')
  if (!u) return false
  try { return JSON.parse(u).role === 'admin' } catch(e) { return false }
})

// ---- 用户管理 ----
const allUsers = ref([])
const showAddUserDialog = ref(false)
const addingUser = ref(false)
const addUserForm = ref({ name: '', password: '', display_name: '', role: 'owner' })

// ---- 编辑用户 ----
const showEditUserDialog = ref(false)
const editingUser = ref(false)
const editUserForm = ref({ name: '', password: '', display_name: '', role: 'owner' })

function showEditUser(row) {
  editUserForm.value = { name: row.name, password: '', display_name: row.display_name, role: row.role }
  showEditUserDialog.value = true
}

async function handleEditUser() {
  const f = editUserForm.value
  editingUser.value = true
  try {
    await api.put(`/users/${f.name}`, { display_name: f.display_name, role: f.role, password: f.password || undefined })
    ElMessage.success(`用户 ${f.display_name} 已更新`)
    showEditUserDialog.value = false
    await loadUsers()
  } catch(e) {
    ElMessage.error('更新失败：' + (e.response?.data?.error || e.message))
  } finally {
    editingUser.value = false
  }
}

async function loadUsers() {
  try {
    const res = await api.get('/users')
    allUsers.value = res.data.users || []
  } catch(e) { /* ignore */ }
}

async function handleAddUser() {
  const f = addUserForm.value
  if (!f.name || !f.password) {
    ElMessage.warning('登录名和密码不能为空')
    return
  }
  addingUser.value = true
  try {
    await api.post('/users', { name: f.name, password: f.password, display_name: f.display_name || f.name, role: f.role })
    ElMessage.success(`用户 ${f.display_name || f.name} 已添加`)
    showAddUserDialog.value = false
    addUserForm.value = { name: '', password: '', display_name: '', role: 'owner' }
    await loadUsers()
  } catch(e) {
    ElMessage.error('添加失败：' + (e.response?.data?.error || e.message))
  } finally {
    addingUser.value = false
  }
}

async function handleDeleteUser(row) {
  if (row.name === 'admin') {
    ElMessage.warning('不能删除管理员账号')
    return
  }
  try {
    await ElMessageBox.confirm(`确定删除用户 ${row.display_name || row.name}？`, '确认', { type: 'warning' })
    await api.delete(`/users/${row.name}`)
    ElMessage.success(`用户 ${row.display_name || row.name} 已删除`)
    await loadUsers()
  } catch(e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

/** 按项目 + Socket 数字排序 */
const sortedPlatforms = computed(() => {
  return [...platforms.value]
    .filter(p => (p.project || 'BR288Y') === currentProject.value)
    .sort((a, b) => {
    const na = parseInt((a.label || a.id || '').replace(/.*?Socket/gi, '').replace(/[^0-9]/g, '') || '0')
    const nb = parseInt((b.label || b.id || '').replace(/.*?Socket/gi, '').replace(/[^0-9]/g, '') || '0')
    return na - nb
  })
})

async function handleTypeChange(row, val) {
  try {
    const res = await fetch('/api/platforms/' + row.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: val })
    })
    if (!res.ok) throw new Error((await res.json()).error)
  } catch(e) { console.error(e) }
}

async function handleLocationChange(row, val) {
  row.location = val
  try {
    const { updatePlatformConfig } = await import('@/api')
    await updatePlatformConfig(row.id, row.config || {}, val)
  } catch(e) { console.error(e) }
}

const detailVisible = ref(false)
const detailPlatform = ref(null)
const detailConfig = ref({})
const detailChips = ref([])
const detailReservations = ref([])
const detailLogs = ref([])

const configVisible = ref(false)
const configPlatform = ref(null)
const configSaving = ref(false)
const configForm = ref({ ip: '', location: '', cpu: '', memory: '', disk: '', os: '', remark: '' })

const reserveVisible = ref(false)
const reservePlatformRef = ref(null)
const reserving = ref(false)
const reserveForm = ref({ teamId: '', owner: '', purpose: '' })

const chipDialogVisible = ref(false)
const chipPlatformLabel = ref('')
const chipSaving = ref(false)
const chipForm = ref({ slot: '', serial: '', type: '', status: 'idle', remark: '' })
const chipEditId = ref(null)
const chipPlatformId = ref('')

// ---- 预分配团队编辑（管理员） ----
const teamAllocVisible = ref(false)
const teamAllocPlatformId = ref('')
const teamAllocSelected = ref([])
const teamAllocSaving = ref(false)

function showTeamAllocEdit(row) {
  teamAllocPlatformId.value = row.id
  teamAllocSelected.value = (row.allocatedTeams || []).map(t => t.team_id)
  teamAllocVisible.value = true
}

async function saveTeamAlloc() {
  teamAllocSaving.value = true
  try {
    const { allocatePlatformTeams } = await import('@/api')
    await allocatePlatformTeams(teamAllocPlatformId.value, teamAllocSelected.value)
    ElMessage.success('预分配团队已更新')
    teamAllocVisible.value = false
    await loadData()
  } catch(e) {
    ElMessage.error('保存失败：' + (e.response?.data?.error || e.message))
  } finally {
    teamAllocSaving.value = false
  }
}

const stageTagType = computed(() => {
  const map = { 'BU': 'danger', 'FE': 'warning', 'FST': 'primary', 'PVT': 'success' }
  return map[currentStage.value] || 'info'
})

function statusLabel(st) {
  const map = { idle: '空闲', in_use: '使用中', maintenance: '维护中' }
  return map[st] || st
}

async function loadData() {
  try {
    const res = await getPlatforms()
    platforms.value = (res.data.platforms || []).map(p => ({
      ...p,
      _os_ip: p.config?.ip || '',
      _os: p.config?.os || '',
      _os_user: p.config?.os_user || '',
      _os_pass: p.config?.os_pass || '',
      _bmc_ip: p.config?.bmc_ip || '',
      _bmc_user: p.config?.bmc_user || '',
      _bmc_pass: p.config?.bmc_pass || '',
      _jtag_box: p.config?.jtag_box || '',
      _jtag_ip: p.config?.jtag_ip || '',
      _jtag_connected: !!(p.config?.jtag_box),
      _editing: false,
      _type: p.type || 'socket',
      _location: p.location || '',
      _asic_id: (p.chips || []).filter(function(c) { return c.platform_id === p.id; }).map(function(c) { return c.asic_id; })[0] || '',
      _motherboard: p.config?.motherboard || p.config?.cpu || '',
      _boundChips: (p.chips || []).filter(function(c) { return c.platform_id === p.id; }),
    }))
    currentStage.value = res.data.currentStage || ''
  } catch(e) {
    ElMessage.error('加载失败')
  }
}

let _saveTimers = {}
function saveConfigField(row, field, value) {
  // 防抖：500ms 后保存
  if (_saveTimers[row.id]) clearTimeout(_saveTimers[row.id])
  _saveTimers[row.id] = setTimeout(async () => {
    const cfg = { ...(row.config || {}) }
    cfg[field] = value
    try {
      const { updatePlatformConfig } = await import('@/api')
      await updatePlatformConfig(row.id, cfg)
    } catch(e) {
      console.error('save config field failed:', e)
    }
  }, 500)
}

function startPlatformEdit(row) {
  row._editing = true
  // 保存当前值以便取消时恢复
  row._saved = {
    _os_ip: row._os_ip,
    _os: row._os,
    _os_user: row._os_user,
    _os_pass: row._os_pass,
    _bmc_ip: row._bmc_ip,
    _bmc_user: row._bmc_user,
    _bmc_pass: row._bmc_pass,
    _jtag_connected: row._jtag_connected,
    _jtag_box: row._jtag_box,
    _jtag_ip: row._jtag_ip,
    _motherboard: row._motherboard,
  }
}

async function savePlatformEdit(row) {
  const cfg = { ...(row.config || {}) }
  cfg.ip = row._os_ip
  cfg.os = row._os
  cfg.os_user = row._os_user
  cfg.os_pass = row._os_pass
  cfg.bmc_ip = row._bmc_ip
  cfg.bmc_user = row._bmc_user
  cfg.bmc_pass = row._bmc_pass
  cfg.jtag_box = row._jtag_connected ? (row._jtag_box || '') : ''
  cfg.jtag_ip = row._jtag_connected ? (row._jtag_ip || '') : ''
  cfg.motherboard = row._motherboard
  try {
    // 保存 config
    await updatePlatformConfig(row.id, cfg)
    // 保存 type 和 location
    await fetch('/api/platforms/' + row.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: row._type, location: row._location })
    })
    // 芯片绑定：如果 ASIC ID 变了，解除旧芯片绑定并绑定新芯片
    const oldAsicId = (row._boundChips || []).map(function(c) { return c.asic_id; })[0] || ''
    const newAsicId = row._asic_id
    console.log('[savePlatformEdit]', row.id, 'oldAsicId:', oldAsicId, 'newAsicId:', newAsicId)
    if (newAsicId && newAsicId !== oldAsicId) {
      // 把之前绑定的芯片解除（如果有）
      if (oldAsicId) {
        await fetch('/api/chips/by-asic/' + encodeURIComponent(oldAsicId) + '/bind', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platformId: null })
        })
      }
      // 绑定新芯片到当前平台
      await fetch('/api/chips/by-asic/' + encodeURIComponent(newAsicId) + '/bind', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platformId: row.id })
      })
    }
    row.config = cfg
    row.type = row._type
    row.location = row._location
    // 更新芯片绑定显示状态
    if (newAsicId && newAsicId !== oldAsicId) {
      row._asic_id = newAsicId
      row._boundChips = [{ asic_id: newAsicId, platform_id: row.id }]
    }
    row._editing = false
    ElMessage.success('配置已保存')
  } catch(e) {
    ElMessage.error('保存失败')
  }
}

function cancelPlatformEdit(row) {
  if (row._saved) {
    Object.assign(row, row._saved)
  }
  row._type = row.type || 'socket'
  row._location = row.location || ''
  row._asic_id = (row.chips || []).filter(function(c) { return c.platform_id === row.id; }).map(function(c) { return c.asic_id; })[0] || ''
  row._motherboard = row.config?.motherboard || row.config?.cpu || ''
  row._editing = false
}

function startJtagEdit(row) {
  row._jtag_editing = true
  row._jtag_connected = !!(row.config?.jtag_box)
  row._jtag_box_saved = row._jtag_box
  row._jtag_ip_saved = row._jtag_ip
}

async function saveJtagEdit(row) {
  const cfg = { ...(row.config || {}) }
  cfg.jtag_box = row._jtag_connected ? (row._jtag_box || '') : ''
  cfg.jtag_ip = row._jtag_connected ? (row._jtag_ip || '') : ''
  try {
    const { updatePlatformConfig } = await import('@/api')
    await updatePlatformConfig(row.id, cfg)
    row.config.jtag_box = cfg.jtag_box
    row.config.jtag_ip = cfg.jtag_ip
    row._jtag_editing = false
    ElMessage.success('JTAG 信息已保存')
  } catch(e) {
    ElMessage.error('保存失败')
  }
}

function cancelJtagEdit(row) {
  row._jtag_box = row._jtag_box_saved || ''
  row._jtag_ip = row._jtag_ip_saved || ''
  row._jtag_editing = false
}

async function loadTeams() {
  try {
    const { getOverview } = await import('@/api')
    const res = await getOverview()
    teams.value = res.data.teams || []
  } catch(e) {}
}

async function showDetail(row) {
  detailPlatform.value = row
  detailConfig.value = row.config || {}
  detailChips.value = []
  detailReservations.value = []
  detailLogs.value = []
  detailVisible.value = true
  try {
    const res = await getPlatformDetail(row.id)
    const d = res.data
    detailConfig.value = d.config || {}
    detailChips.value = d.chips || []
    detailReservations.value = d.reservations || []
    detailLogs.value = d.logs || []
  } catch(e) {
    ElMessage.error('加载详情失败')
  }
}

function showConfigEdit(row) {
  configPlatform.value = row
  const c = row.config || {}
  configForm.value = {
    ip: c.ip || '',
    location: row.location || '',
    cpu: c.cpu || c.motherboard || '',
    memory: c.memory || '',
    disk: c.disk || '',
    os: c.os || '',
    remark: c.remark || ''
  }
  configVisible.value = true
}

async function saveConfig() {
  configSaving.value = true
  try {
    const cfg = {
      ip: configForm.value.ip,
      cpu: configForm.value.cpu,
      memory: configForm.value.memory,
      disk: configForm.value.disk,
      os: configForm.value.os,
      remark: configForm.value.remark
    }
    // Save config to platforms table and location
    await updatePlatformConfig(configPlatform.value.id, cfg)
    // Update location separately
    await updatePlatformStatus(configPlatform.value.id, configPlatform.value.status, 'Config updated')

    ElMessage.success('配置已保存')
    configVisible.value = false
    await loadData()
    // Refresh detail if open
    if (detailVisible.value && detailPlatform.value?.id === configPlatform.value.id) {
      await showDetail(detailPlatform.value)
    }
  } catch(e) {
    ElMessage.error('保存失败')
  } finally {
    configSaving.value = false
  }
}

async function changeStatus(id, status) {
  try {
    await updatePlatformStatus(id, status, `Manual set to ${status}`)
    ElMessage.success('状态已更新')
    await loadData()
  } catch(e) {
    ElMessage.error('更新失败')
  }
}

/** 平台列的状态下拉变更 */
async function handleStatusChange(row, newStatus) {
  if (!row) return
  // 如果改为使用中，弹出对话框填写团队和负责人
  if (newStatus === 'in_use') {
    reservePlatformRef.value = row
    reserveForm.value = { teamId: '', owner: '', purpose: '' }
    reserveVisible.value = true
    // 重置下拉框回原值（等待弹窗确认后真正修改）
    row._statusLoading = false
    return
  }
  row._statusLoading = true
  try {
    await updatePlatformStatus(row.id, newStatus, `Status changed to ${newStatus}`)
    ElMessage.success(`已设为${statusLabel(newStatus)}`)
    await loadData()
  } catch(e) {
    ElMessage.error('变更失败：' + (e.response?.data?.error || e.message))
    await loadData()
  } finally {
    row._statusLoading = false
  }
}

function showQuickReserve(row) {
  reservePlatformRef.value = row
  // 从 localStorage 获取当前登录用户
  let userName = ''
  try {
    const u = JSON.parse(localStorage.getItem('hw_reservation_user') || '{}')
    userName = u.display_name || u.name || ''
  } catch(e) {}
  reserveForm.value = { teamId: '', owner: userName, purpose: '' }
  reserveVisible.value = true
}

let _copyFromPlatform = null
const copyDialogVisible = ref(false)
const _copyPlatforms = ref([])

/** 选择复制来源后，输入新平台名 */
async function handleCopySelect(source) {
  _copyFromPlatform = source
  copyDialogVisible.value = false
  ElMessageBox.prompt('请输入新平台名称', '新建平台', {
    confirmButtonText: '创建',
    cancelButtonText: '取消',
    inputPattern: /^Socket\d+$/,
    inputErrorMessage: '格式: Socket + 数字'
  }).then(async ({ value: newId }) => {
    if (platforms.value.find(p => p.id === newId)) {
      ElMessage.error('该平台已存在')
      return
    }
    try {
      const project = localStorage.getItem('hw_reservation_project') || 'BR288Y'
      const cfg = _copyFromPlatform.config || {}
      await api.post('/platforms', {
        id: newId, label: newId, project,
        config: cfg,
        location: _copyFromPlatform.location || ''
      })
      ElMessage.success(`平台 ${newId} 已创建（复制自 ${_copyFromPlatform.id}）`)
      await loadData()
    } catch(e) {
      ElMessage.error('创建失败：' + (e.response?.data?.error || e.message))
    }
  }).catch(() => {})
}

/** 删除平台 */
async function handleDeletePlatform(row) {
  if (!row) return
  try {
    await ElMessageBox.confirm(`确定删除平台 ${row.label}？此操作不可恢复。`, '确认删除', {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await api.delete(`/platforms/${row.id}`)
    ElMessage.success(`平台 ${row.label} 已删除`)
    await loadData()
  } catch(e) {
    if (e !== 'cancel') ElMessage.error('删除失败：' + (e.response?.data?.error || e.message))
  }
}

async function handleNewPlatform(cmd) {
  if (cmd === 'new') {
    // 新建平台：弹出输入框
    ElMessageBox.prompt('请输入新平台名称 (例如 Socket16)', '新建平台', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPattern: /^Socket\d+$/,
      inputErrorMessage: '格式: Socket + 数字'
    }).then(async ({ value }) => {
      if (platforms.value.find(p => p.id === value)) {
        ElMessage.error('该平台已存在')
        return
      }
      try {
        const project = localStorage.getItem('hw_reservation_project') || 'BR288Y'
        await api.post('/platforms', { id: value, label: value, project })
        ElMessage.success(`平台 ${value} 已创建`)
        await loadData()
      } catch(e) {
        ElMessage.error('创建失败：' + (e.response?.data?.error || e.message))
      }
    })
  } else if (cmd === 'copy') {
    // 从已有平台复制：打开对话框，显示所有平台列表供选择
    _copyPlatforms.value = platforms.value.filter(p => p.status === 'idle')
    if (!_copyPlatforms.value.length) {
      ElMessage.warning('没有可复制的空闲平台')
      return
    }
    copyDialogVisible.value = true
  }
}

async function doReserve() {
  if (!reserveForm.value.teamId) {
    ElMessage.warning('请选择团队')
    return
  }
  reserving.value = true
  try {
    await reservePlatform(reserveForm.value.teamId, reservePlatformRef.value.id, reserveForm.value.purpose, reserveForm.value.owner)
    // 如果状态是使用中，同时更新平台状态
    if (reservePlatformRef.value) {
      await updatePlatformStatus(reservePlatformRef.value.id, 'in_use', `预约 - ${reserveForm.value.owner || ''} ${reserveForm.value.purpose || ''}`)
    }
    ElMessage.success('预约成功，平台已设为使用中')
    reserveVisible.value = false
    await loadData()
    if (detailVisible.value && detailPlatform.value?.id === reservePlatformRef.value.id) {
      await showDetail(detailPlatform.value)
    }
  } catch(e) {
    ElMessage.error('预约失败：' + (e.response?.data?.error || e.message))
  } finally {
    reserving.value = false
  }
}

function addChipForPlatform(platformId) {
  chipPlatformId.value = platformId
  chipPlatformLabel.value = detailPlatform.value?.label || ''
  chipEditId.value = null
  chipForm.value = { slot: '', serial: '', type: '', status: 'idle', remark: '' }
  chipDialogVisible.value = true
}

function editChipInDetail(row) {
  chipPlatformId.value = row.platform_id
  chipPlatformLabel.value = detailPlatform.value?.label || ''
  chipEditId.value = row.id
  chipForm.value = {
    slot: row.slot,
    serial: row.serial,
    type: row.type,
    status: row.status,
    remark: row.remark
  }
  chipDialogVisible.value = true
}

async function saveChipInDetail() {
  chipSaving.value = true
  try {
    if (chipEditId.value) {
      await updateChip(chipEditId.value, chipForm.value)
      ElMessage.success('芯片已更新')
    } else {
      await createChip({ platformId: chipPlatformId.value, ...chipForm.value })
      ElMessage.success('芯片已添加')
    }
    chipDialogVisible.value = false
    if (detailVisible.value && detailPlatform.value) {
      const res = await getPlatformDetail(detailPlatform.value.id)
      detailChips.value = res.data.chips || []
    }
  } catch(e) {
    ElMessage.error('操作失败：' + (e.response?.data?.error || e.message))
  } finally {
    chipSaving.value = false
  }
}

async function delChipInDetail(row) {
  try {
    await ElMessageBox.confirm(`确定删除芯片 ${row.serial || '#'+row.id} ？`, '确认')
    await deleteChip(row.id)
    ElMessage.success('已删除')
    if (detailVisible.value && detailPlatform.value) {
      const res = await getPlatformDetail(detailPlatform.value.id)
      detailChips.value = res.data.chips || []
    }
  } catch(e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

onMounted(() => {
  loadData()
  loadTeams()
  loadUsers()
})

// 监听项目切换事件
if (typeof window !== 'undefined') {
  window.addEventListener('project-changed', () => { loadData() })
}
</script>

<style scoped>
.status-select-idle :deep(.el-select__wrapper) { background: #67C23A; }
.status-select-idle :deep(.el-select__wrapper .el-select__selected-item) { color: #fff; }
.status-select-in_use :deep(.el-select__wrapper) { background: #E6A23C; }
.status-select-in_use :deep(.el-select__wrapper .el-select__selected-item) { color: #fff; }
.status-select-maintenance :deep(.el-select__wrapper) { background: #909399; }
.status-select-maintenance :deep(.el-select__wrapper .el-select__selected-item) { color: #fff; }
</style>