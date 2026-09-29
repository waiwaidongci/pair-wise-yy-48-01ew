import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

export type DeviceType = '感烟探测器' | '感温探测器' | '手动报警按钮' | '输入模块' | '输出模块' | '排烟风机' | '防火卷帘' | '消防广播' | '电梯'
export type Device = { id: string; name: string; type: DeviceType; floor: string; zone: string; address: string }
export type Rule = {
  id: string
  triggerId: string
  actionId: string
  delay: number
  interlock: string
  priority: 1 | 2 | 3
  suppression: string
  enabled: boolean
}
export type Validation = { id: string; severity: '错误' | '警告'; ruleIds: string[]; title: string; detail: string; suggestion: string }

export type RuleField = 'delay' | 'interlock' | 'priority' | 'suppression' | 'enabled'
export type DeviceField = 'name' | 'floor' | 'zone' | 'address'
export type BatchStatus = '待合并' | '待核对' | '已合并' | '已失效' | '合并失败' | '已回滚'
export type RuleChange = { ruleId: string; fields: Partial<Pick<Rule, RuleField>> }
export type DeviceChange = { deviceId: string; fields: Partial<Pick<Device, DeviceField>> }
export type AppliedChange = { targetId: string; kind: 'rule' | 'device'; field: string; prev: unknown; next: unknown }
export type MergeConflict = {
  ruleId: string
  field: RuleField
  batchValue: unknown
  currentValue: unknown
  reason: string
  resolution?: '采用批次值' | '保留基线值'
}
export type OfflineBatch = {
  id: string
  title: string
  author: string
  createdAt: string
  baseRevision: number
  status: BatchStatus
  deviceChanges: DeviceChange[]
  ruleChanges: RuleChange[]
  deviceZones: Record<string, string>
  conflicts: MergeConflict[]
  applied: AppliedChange[]
  invalidReason: string
  retryCount: number
  verified: boolean
  mergedAt: string
}
export type RevisionRecord = { revision: number; signedAt: string; batchIds: string[]; snapshot: { devices: Device[]; rules: Rule[] } }
export type RollbackRecord = { id: string; at: string; batchId: string; revision: number; detail: string }

export const fieldLabels: Record<string, string> = {
  delay: '延时', interlock: '互锁', priority: '优先级', suppression: '抑制', enabled: '启停',
  name: '名称', floor: '楼层', zone: '分区', address: '地址',
}

export function batchStatusColor(status: BatchStatus): string {
  return { 待合并: 'info', 待核对: 'warning', 已合并: 'success', 已失效: 'error', 合并失败: 'error', 已回滚: '' }[status] ?? ''
}

export const seedDevices: Device[] = [
  { id: 'D-01-01', name: '一层大厅感烟 01', type: '感烟探测器', floor: '1F', zone: 'A 区', address: '1-A-01-01' },
  { id: 'D-01-02', name: '一层大厅感烟 02', type: '感烟探测器', floor: '1F', zone: 'A 区', address: '1-A-01-02' },
  { id: 'D-01-11', name: '一层东侧手报', type: '手动报警按钮', floor: '1F', zone: 'A 区', address: '1-A-02-01' },
  { id: 'A-01-01', name: '一层排烟风机 PF-1', type: '排烟风机', floor: '1F', zone: 'A 区', address: '1-F-01-01' },
  { id: 'A-01-02', name: '中庭防火卷帘 01', type: '防火卷帘', floor: '1F', zone: '中庭', address: '1-R-01-01' },
  { id: 'A-01-03', name: '一层消防广播', type: '消防广播', floor: '1F', zone: 'A 区', address: '1-B-01-01' },
  { id: 'D-02-01', name: '二层机房感温 01', type: '感温探测器', floor: '2F', zone: 'B 区', address: '2-B-01-01' },
  { id: 'D-02-02', name: '二层机房感烟 01', type: '感烟探测器', floor: '2F', zone: 'B 区', address: '2-B-01-02' },
  { id: 'A-02-01', name: '二层排烟风机 PF-2', type: '排烟风机', floor: '2F', zone: 'B 区', address: '2-F-01-01' },
  { id: 'A-02-02', name: '1 号客梯归位', type: '电梯', floor: '2F', zone: 'B 区', address: '2-L-01-01' },
]

export const seedRules: Rule[] = [
  { id: 'R-001', triggerId: 'D-01-01', actionId: 'A-01-01', delay: 0, interlock: '卷帘全开后启动', priority: 1, suppression: '无', enabled: true },
  { id: 'R-002', triggerId: 'D-01-01', actionId: 'A-01-03', delay: 5, interlock: '无', priority: 2, suppression: '手动广播优先', enabled: true },
  { id: 'R-003', triggerId: 'D-01-02', actionId: 'A-01-02', delay: 0, interlock: '排烟风机运行', priority: 1, suppression: '无', enabled: true },
  { id: 'R-004', triggerId: 'D-01-11', actionId: 'A-01-03', delay: 3, interlock: '无', priority: 1, suppression: '无', enabled: true },
  { id: 'R-005', triggerId: 'D-02-01', actionId: 'A-02-01', delay: 0, interlock: '防火阀开启反馈', priority: 1, suppression: '无', enabled: true },
  { id: 'R-006', triggerId: 'D-02-01', actionId: 'A-02-02', delay: 10, interlock: '轿厢无人确认', priority: 2, suppression: '消防电梯模式', enabled: true },
  { id: 'R-007', triggerId: 'D-02-02', actionId: 'A-01-01', delay: 0, interlock: '无', priority: 3, suppression: '无', enabled: false },
  { id: 'R-008', triggerId: 'D-01-01', actionId: 'A-02-02', delay: 0, interlock: '无', priority: 1, suppression: '无', enabled: true },
]

const seedBatches: OfflineBatch[] = [
  {
    id: 'OB-0917-A', title: '一层排烟与电梯归位现场调试', author: '暖通专业 · 王工', createdAt: '2026-09-17 14:20', baseRevision: 8, status: '待合并',
    deviceChanges: [],
    ruleChanges: [
      { ruleId: 'R-005', fields: { interlock: '防火阀开启反馈 + 风阀联动' } },
      { ruleId: 'R-006', fields: { delay: 12 } },
    ],
    deviceZones: { 'D-02-01': 'B 区', 'A-02-01': 'B 区', 'A-02-02': 'B 区' },
    conflicts: [], applied: [], invalidReason: '', retryCount: 0, verified: false, mergedAt: '',
  },
  {
    id: 'OB-0918-B', title: '电梯延时与机房联动复核', author: '消防电专业 · 李工', createdAt: '2026-09-18 09:05', baseRevision: 8, status: '待合并',
    deviceChanges: [],
    ruleChanges: [
      { ruleId: 'R-006', fields: { delay: 15 } },
      { ruleId: 'R-002', fields: { delay: 8 } },
      { ruleId: 'R-007', fields: { enabled: true } },
    ],
    deviceZones: { 'D-02-01': 'B 区', 'A-02-02': 'B 区', 'D-01-01': 'A 区', 'A-01-03': 'A 区', 'D-02-02': 'B 区', 'A-01-01': 'A 区' },
    conflicts: [], applied: [], invalidReason: '', retryCount: 0, verified: false, mergedAt: '',
  },
  {
    id: 'OB-0919-C', title: '中庭卷帘分区与手报台账修正', author: '智能化专业 · 赵工', createdAt: '2026-09-19 16:40', baseRevision: 8, status: '待合并',
    deviceChanges: [
      { deviceId: 'A-01-02', fields: { zone: 'A 区' } },
      { deviceId: 'D-01-11', fields: { address: '1-A-02-09' } },
    ],
    ruleChanges: [{ ruleId: 'R-003', fields: { interlock: '排烟风机运行 + 卷帘反馈' } }],
    deviceZones: { 'A-01-02': '中庭', 'D-01-11': 'A 区', 'D-01-02': 'A 区' },
    conflicts: [], applied: [], invalidReason: '', retryCount: 0, verified: false, mergedAt: '',
  },
]

const CONFLICT_FIELDS: RuleField[] = ['delay', 'interlock', 'enabled']

function now() {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

function readField(target: object, field: string): unknown {
  return (target as unknown as Record<string, unknown>)[field]
}

function writeField(target: object, field: string, value: unknown) {
  ;(target as unknown as Record<string, unknown>)[field] = value
}

export const useLinkageStore = defineStore('linkage', () => {
  const saved = localStorage.getItem('fire-linkage-draft-v1')
  const restored = saved ? JSON.parse(saved) : null
  const devices = ref<Device[]>(restored?.devices ?? structuredClone(seedDevices))
  const rules = ref<Rule[]>(restored?.rules ?? structuredClone(seedRules))
  const revision = ref(restored?.revision ?? 8)
  const locked = ref(restored?.locked ?? false)
  const acceptedChanges = ref<string[]>(restored?.acceptedChanges ?? ['CH-01'])
  const selectedRuleIds = ref<string[]>([])
  const online = ref<boolean>(restored?.online ?? true)
  const batches = ref<OfflineBatch[]>(restored?.batches ?? structuredClone(seedBatches))
  const verifiedFields = ref<Record<string, string>>(restored?.verifiedFields ?? {})
  const mergedFields = ref<Record<string, string>>(restored?.mergedFields ?? {})
  const revisions = ref<RevisionRecord[]>(restored?.revisions ?? [
    { revision: 8, signedAt: '2026-09-15 10:00', batchIds: [], snapshot: { devices: structuredClone(seedDevices), rules: structuredClone(seedRules) } },
  ])
  const rollbacks = ref<RollbackRecord[]>(restored?.rollbacks ?? [])

  const validations = computed<Validation[]>(() => {
    const result: Validation[] = []
    const triggers = devices.value.filter((device) => ['感烟探测器', '感温探测器', '手动报警按钮', '输入模块'].includes(device.type))
    for (const trigger of triggers) {
      const enabled = rules.value.filter((rule) => rule.triggerId === trigger.id && rule.enabled)
      if (enabled.length === 0) {
        result.push({ id: `missing-${trigger.id}`, severity: '错误', ruleIds: [], title: `${trigger.name} 缺少联动动作`, detail: '报警点未配置任何启用的因果规则。', suggestion: '至少配置广播、排烟或疏散相关动作。' })
      }
      const actionCount = new Map<string, number>()
      enabled.forEach((rule) => actionCount.set(rule.actionId, (actionCount.get(rule.actionId) ?? 0) + 1))
      actionCount.forEach((count, actionId) => {
        if (count > 1) result.push({ id: `duplicate-${trigger.id}-${actionId}`, severity: '警告', ruleIds: enabled.filter((rule) => rule.actionId === actionId).map((rule) => rule.id), title: `${trigger.name} 存在重复动作`, detail: `同一个动作 ${actionId} 被重复配置 ${count} 次。`, suggestion: '合并规则或明确主备关系。' })
      })
    }
    rules.value.filter((rule) => rule.enabled).forEach((rule) => {
      const trigger = devices.value.find((device) => device.id === rule.triggerId)
      const action = devices.value.find((device) => device.id === rule.actionId)
      if (trigger && action && trigger.zone !== action.zone && rule.suppression === '无') {
        result.push({ id: `cross-${rule.id}`, severity: '警告', ruleIds: [rule.id], title: `${rule.id} 跨区联动未配置抑制`, detail: `${trigger.zone} 报警将直接触发 ${action.zone} 动作。`, suggestion: '确认疏散边界并增加分区确认或抑制条件。' })
      }
      if (rule.interlock && rule.delay > 5 && rule.priority === 1) {
        result.push({ id: `contradiction-${rule.id}`, severity: '错误', ruleIds: [rule.id], title: `${rule.id} 互锁与高优先级延时冲突`, detail: '一级优先规则在互锁未明确反馈前延时超过 5 秒。', suggestion: '缩短延时或改为反馈后触发。' })
      }
    })
    return result
  })

  watch([devices, rules, revision, locked, acceptedChanges, online, batches, verifiedFields, mergedFields, revisions, rollbacks], () => {
    localStorage.setItem('fire-linkage-draft-v1', JSON.stringify({
      devices: devices.value, rules: rules.value, revision: revision.value, locked: locked.value, acceptedChanges: acceptedChanges.value,
      online: online.value, batches: batches.value, verifiedFields: verifiedFields.value, mergedFields: mergedFields.value,
      revisions: revisions.value, rollbacks: rollbacks.value,
    }))
  }, { deep: true })

  function updateRule(id: string, patch: Partial<Rule>) {
    if (locked.value) return
    const rule = rules.value.find((item) => item.id === id)
    if (rule) Object.assign(rule, patch)
  }

  function addRule() {
    if (locked.value) return
    rules.value.push({
      id: `R-${String(rules.value.length + 1).padStart(3, '0')}`,
      triggerId: devices.value[0]?.id ?? '',
      actionId: devices.value.at(-1)?.id ?? '',
      delay: 0,
      interlock: '无',
      priority: 2,
      suppression: '无',
      enabled: true,
    })
    revision.value += 1
  }

  function batchUpdate(patch: Partial<Rule>) {
    if (locked.value) return
    rules.value = rules.value.map((rule) => (selectedRuleIds.value.includes(rule.id) ? { ...rule, ...patch } : rule))
  }

  function toggleSelected(enabled: boolean) {
    batchUpdate({ enabled })
  }

  function lockBaseline() {
    const recorded = new Set(revisions.value.flatMap((item) => item.batchIds))
    const mergedIds = batches.value.filter((batch) => batch.status === '已合并' && !recorded.has(batch.id)).map((batch) => batch.id)
    revision.value += 1
    revisions.value.unshift({
      revision: revision.value,
      signedAt: now(),
      batchIds: mergedIds,
      snapshot: { devices: structuredClone(devices.value), rules: structuredClone(rules.value) },
    })
    locked.value = true
  }

  function unlock() {
    locked.value = false
  }

  // ---- 离线批次 ----

  function touchedDeviceIds(batch: OfflineBatch): string[] {
    const ids = new Set(batch.deviceChanges.map((change) => change.deviceId))
    batch.ruleChanges.forEach((change) => {
      const rule = rules.value.find((item) => item.id === change.ruleId)
      if (rule) {
        ids.add(rule.triggerId)
        ids.add(rule.actionId)
      }
    })
    return [...ids]
  }

  function snapshotZones(batch: OfflineBatch): Record<string, string> {
    const zones: Record<string, string> = {}
    touchedDeviceIds(batch).forEach((id) => {
      const device = devices.value.find((item) => item.id === id)
      if (device) zones[id] = device.zone
    })
    return zones
  }

  function findInvalidReason(batch: OfflineBatch): string {
    for (const [deviceId, zone] of Object.entries(batch.deviceZones)) {
      const device = devices.value.find((item) => item.id === deviceId)
      if (!device) return `点位 ${deviceId} 已被移除`
      if (device.zone !== zone) return `点位 ${deviceId} 跨区变化（${zone} → ${device.zone}）`
    }
    return ''
  }

  function invalidateBatchesForDevice(deviceId: string, reason: string, exceptId = '') {
    batches.value.forEach((batch) => {
      if (batch.id === exceptId) return
      if (['待合并', '合并失败'].includes(batch.status) && deviceId in batch.deviceZones) {
        batch.status = '已失效'
        batch.invalidReason = reason
      }
    })
  }

  function mergeBatch(id: string) {
    const batch = batches.value.find((item) => item.id === id)
    if (!batch || !['待合并', '合并失败'].includes(batch.status)) return
    if (!online.value) {
      batch.status = '合并失败'
      batch.retryCount += 1
      return
    }
    const invalid = findInvalidReason(batch)
    if (invalid) {
      batch.status = '已失效'
      batch.invalidReason = invalid
      return
    }
    batch.conflicts = []
    for (const change of batch.deviceChanges) {
      const device = devices.value.find((item) => item.id === change.deviceId)
      if (!device) continue
      for (const [field, value] of Object.entries(change.fields)) {
        if (readField(device, field) === value) continue
        batch.applied.push({ targetId: device.id, kind: 'device', field, prev: readField(device, field), next: value })
        writeField(device, field, value)
      }
    }
    for (const change of batch.ruleChanges) {
      const rule = rules.value.find((item) => item.id === change.ruleId)
      if (!rule) continue
      for (const [field, value] of Object.entries(change.fields) as [RuleField, unknown][]) {
        const key = `${change.ruleId}.${field}`
        if (readField(rule, field) === value) continue
        const verifiedBy = verifiedFields.value[key]
        if (verifiedBy && verifiedBy !== batch.id) {
          batch.conflicts.push({ ruleId: change.ruleId, field, batchValue: value, currentValue: readField(rule, field), reason: `字段已被批次 ${verifiedBy} 核对，晚到批次不可覆盖` })
          continue
        }
        const mergedBy = mergedFields.value[key]
        if (CONFLICT_FIELDS.includes(field) && mergedBy && mergedBy !== batch.id) {
          batch.conflicts.push({ ruleId: change.ruleId, field, batchValue: value, currentValue: readField(rule, field), reason: `与批次 ${mergedBy} 修改同一${fieldLabels[field]}字段` })
          continue
        }
        batch.applied.push({ targetId: rule.id, kind: 'rule', field, prev: readField(rule, field), next: value })
        writeField(rule, field, value)
        mergedFields.value[key] = batch.id
      }
    }
    batch.deviceChanges.forEach((change) => {
      if (change.fields.zone) invalidateBatchesForDevice(change.deviceId, `点位 ${change.deviceId} 跨区变化（批次 ${batch.id} 合并）`, batch.id)
    })
    batch.mergedAt = now()
    batch.status = batch.conflicts.length ? '待核对' : '已合并'
  }

  function resolveConflict(batchId: string, index: number, adopt: boolean) {
    const batch = batches.value.find((item) => item.id === batchId)
    if (!batch || batch.status !== '待核对') return
    const conflict = batch.conflicts[index]
    if (!conflict || conflict.resolution) return
    conflict.resolution = adopt ? '采用批次值' : '保留基线值'
    if (adopt) {
      const rule = rules.value.find((item) => item.id === conflict.ruleId)
      if (rule) {
        batch.applied.push({ targetId: rule.id, kind: 'rule', field: conflict.field, prev: readField(rule, conflict.field), next: conflict.batchValue })
        writeField(rule, conflict.field, conflict.batchValue)
        mergedFields.value[`${conflict.ruleId}.${conflict.field}`] = batch.id
      }
    }
    if (batch.conflicts.every((item) => item.resolution)) batch.status = '已合并'
  }

  function verifyBatch(id: string) {
    const batch = batches.value.find((item) => item.id === id)
    if (!batch || batch.status !== '已合并' || batch.verified) return
    batch.applied.forEach((change) => {
      if (change.kind === 'rule') verifiedFields.value[`${change.targetId}.${change.field}`] = batch.id
    })
    batch.verified = true
  }

  function rollbackBatch(id: string) {
    const batch = batches.value.find((item) => item.id === id)
    if (!batch || batch.status !== '已合并') return
    ;[...batch.applied].reverse().forEach((change) => {
      const target = change.kind === 'rule'
        ? rules.value.find((item) => item.id === change.targetId)
        : devices.value.find((item) => item.id === change.targetId)
      if (target) writeField(target, change.field, change.prev)
      const key = `${change.targetId}.${change.field}`
      if (mergedFields.value[key] === batch.id) delete mergedFields.value[key]
      if (verifiedFields.value[key] === batch.id) delete verifiedFields.value[key]
    })
    rollbacks.value.unshift({
      id: `RB-${String(rollbacks.value.length + 1).padStart(2, '0')}`,
      at: now(),
      batchId: batch.id,
      revision: revision.value,
      detail: `回滚批次 ${batch.id}（${batch.title}）的 ${batch.applied.length} 处改动`,
    })
    batch.applied = []
    batch.verified = false
    batch.status = '已回滚'
  }

  function reconfirmBatch(id: string) {
    const batch = batches.value.find((item) => item.id === id)
    if (!batch || batch.status !== '已失效') return
    batch.deviceZones = snapshotZones(batch)
    batch.invalidReason = ''
    batch.status = '待合并'
  }

  function addSimulatedBatch() {
    const rule = rules.value[batches.value.length % Math.max(rules.value.length, 1)]
    if (!rule) return
    const batch: OfflineBatch = {
      id: `OB-0929-${String(batches.value.length + 1).padStart(2, '0')}`,
      title: '现场断网补录批次',
      author: '调试组 · 现场终端',
      createdAt: now(),
      baseRevision: revision.value,
      status: '待合并',
      deviceChanges: [],
      ruleChanges: [{ ruleId: rule.id, fields: { delay: rule.delay + 3 } }],
      deviceZones: {},
      conflicts: [], applied: [], invalidReason: '', retryCount: 0, verified: false, mergedAt: '',
    }
    batch.deviceZones = snapshotZones(batch)
    batches.value.unshift(batch)
  }

  function removeDevice(id: string) {
    if (locked.value) return
    const index = devices.value.findIndex((item) => item.id === id)
    if (index === -1) return
    devices.value.splice(index, 1)
    invalidateBatchesForDevice(id, `点位 ${id} 已被移除`)
  }

  function updateDevice(id: string, patch: Partial<Pick<Device, DeviceField>>) {
    if (locked.value) return
    const device = devices.value.find((item) => item.id === id)
    if (!device) return
    const prevZone = device.zone
    Object.assign(device, patch)
    if (patch.zone && patch.zone !== prevZone) {
      invalidateBatchesForDevice(id, `点位 ${id} 跨区变化（${prevZone} → ${patch.zone}）`)
    }
  }

  function batchesForRule(ruleId: string) {
    return batches.value.filter((batch) => batch.ruleChanges.some((change) => change.ruleId === ruleId))
  }

  function batchesForDevice(deviceId: string) {
    return batches.value.filter((batch) => batch.deviceChanges.some((change) => change.deviceId === deviceId) || deviceId in batch.deviceZones)
  }

  return {
    devices, rules, revision, locked, acceptedChanges, selectedRuleIds, validations,
    online, batches, verifiedFields, revisions, rollbacks,
    updateRule, addRule, batchUpdate, toggleSelected, lockBaseline, unlock,
    mergeBatch, resolveConflict, verifyBatch, rollbackBatch, reconfirmBatch, addSimulatedBatch,
    removeDevice, updateDevice, batchesForRule, batchesForDevice,
  }
})
