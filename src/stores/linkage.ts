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

// 批次合并相关类型
export type BatchStatus = '待合并' | '已合并' | '待核对' | '已核对' | '已失效' | '合并失败' | '已回滚'
export type ChangeKind = 'add' | 'remove' | 'update'
export type DeviceChange = {
  kind: ChangeKind
  deviceId: string
  before?: Device
  after?: Device
  afterPatch?: Partial<Device>
  zoneChanged?: boolean
}
export type RuleChange = {
  kind: ChangeKind
  ruleId: string
  before?: Rule
  after?: Rule
  afterPatch?: Partial<Rule>
  fields?: (keyof Rule)[]
}
export type Batch = {
  id: string
  code: string
  source: string
  bornRevision: number
  createdAt: string
  status: BatchStatus
  deviceChanges: DeviceChange[]
  ruleChanges: RuleChange[]
  appliedCount: number
  mergedAt?: string
  mergedRevision?: number
  invalidReason?: string
  failReason?: string
  conflictReason?: string
  rejectedFields?: string[]
  retryCount: number
  note?: string
}
export type BatchConflict = {
  id: string
  ruleId: string
  field: string
  batchIds: string[]
  status: '待核对' | '已核对'
  reason: string
  resolution?: string
  winningBatchId?: string
  resolvedAt?: string
}
export type RollbackRecord = {
  id: string
  batchId: string
  batchCode: string
  revision: number
  rolledBackAt: string
  reason: string
}
export type RevisionRecord = {
  revision: number
  signedAt: string
  note: string
  locked: boolean
  devices: Device[]
  rules: Rule[]
  batchIds: string[]
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

// 离线批次种子：每批记录出生版本（bornRevision=8），回网后按字段级合并
export const seedBatches: Batch[] = [
  {
    id: 'B-01',
    code: 'B-2026-09-01',
    source: '暖通专业',
    bornRevision: 8,
    createdAt: '2026-09-28 14:20',
    status: '待合并',
    appliedCount: 0,
    retryCount: 0,
    deviceChanges: [],
    ruleChanges: [
      { kind: 'update', ruleId: 'R-005', before: { ...seedRules.find((r) => r.id === 'R-005')! }, afterPatch: { interlock: '排烟风机运行' }, fields: ['interlock'] },
      { kind: 'update', ruleId: 'R-006', before: { ...seedRules.find((r) => r.id === 'R-006')! }, afterPatch: { delay: 12 }, fields: ['delay'] },
    ],
  },
  {
    id: 'B-02',
    code: 'B-2026-09-02',
    source: '电梯专业',
    bornRevision: 8,
    createdAt: '2026-09-28 15:05',
    status: '待合并',
    appliedCount: 0,
    retryCount: 0,
    deviceChanges: [],
    ruleChanges: [
      { kind: 'update', ruleId: 'R-006', before: { ...seedRules.find((r) => r.id === 'R-006')! }, afterPatch: { delay: 15, interlock: '消防电梯模式' }, fields: ['delay', 'interlock'] },
    ],
  },
  {
    id: 'B-03',
    code: 'B-2026-09-03',
    source: '智能化专业',
    bornRevision: 8,
    createdAt: '2026-09-28 16:40',
    status: '待合并',
    appliedCount: 0,
    retryCount: 0,
    deviceChanges: [
      { kind: 'add', deviceId: 'D-02-03', after: { id: 'D-02-03', name: '二层机房感烟 03', type: '感烟探测器', floor: '2F', zone: 'B 区', address: '2-B-01-03' } },
    ],
    ruleChanges: [
      { kind: 'add', ruleId: 'R-009', after: { id: 'R-009', triggerId: 'D-02-03', actionId: 'A-02-01', delay: 0, interlock: '无', priority: 2, suppression: '无', enabled: true } },
    ],
  },
  {
    id: 'B-04',
    code: 'B-2026-09-04',
    source: '调试组',
    bornRevision: 8,
    createdAt: '2026-09-28 17:15',
    status: '待合并',
    appliedCount: 0,
    retryCount: 0,
    deviceChanges: [
      { kind: 'remove', deviceId: 'D-01-02', before: { ...seedDevices.find((d) => d.id === 'D-01-02')! } },
    ],
    ruleChanges: [],
  },
  {
    id: 'B-05',
    code: 'B-2026-09-05',
    source: '现场调试组',
    bornRevision: 8,
    createdAt: '2026-09-28 18:00',
    status: '合并失败',
    appliedCount: 0,
    retryCount: 0,
    deviceChanges: [],
    ruleChanges: [
      { kind: 'update', ruleId: 'R-006', before: { ...seedRules.find((r) => r.id === 'R-006')! }, afterPatch: { delay: 18 }, fields: ['delay'] },
    ],
    failReason: '现场断网，合并事务未提交（网络中断）',
  },
  {
    id: 'B-06',
    code: 'B-2026-09-06',
    source: '现场调试组',
    bornRevision: 8,
    createdAt: '2026-09-28 18:20',
    status: '待合并',
    appliedCount: 0,
    retryCount: 0,
    deviceChanges: [
      { kind: 'update', deviceId: 'D-02-01', before: { ...seedDevices.find((d) => d.id === 'D-02-01')! }, afterPatch: { zone: 'A 区' }, zoneChanged: true },
    ],
    ruleChanges: [],
  },
]

function nowIso() {
  return new Date().toISOString()
}

// 深拷贝：响应式 Proxy 无法用 structuredClone，这里数据均为纯 JSON 结构
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

export const useLinkageStore = defineStore('linkage', () => {
  const SAVE_KEY = 'fire-linkage-draft-v2'
  const saved = localStorage.getItem(SAVE_KEY)
  const restored = saved ? JSON.parse(saved) : null
  const devices = ref<Device[]>(restored?.devices ?? deepClone(seedDevices))
  const rules = ref<Rule[]>(restored?.rules ?? deepClone(seedRules))
  const revision = ref(restored?.revision ?? 8)
  const locked = ref(restored?.locked ?? false)
  const acceptedChanges = ref<string[]>(restored?.acceptedChanges ?? ['CH-01'])
  const selectedRuleIds = ref<string[]>([])
  const batches = ref<Batch[]>(restored?.batches ?? deepClone(seedBatches))
  const conflicts = ref<BatchConflict[]>(restored?.conflicts ?? [])
  const rollbacks = ref<RollbackRecord[]>(restored?.rollbacks ?? [])
  const revisions = ref<RevisionRecord[]>(restored?.revisions ?? [])

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

  const pendingBatchCount = computed(() => batches.value.filter((b) => b.status === '待合并' || b.status === '合并失败').length)
  const openConflictCount = computed(() => conflicts.value.filter((c) => c.status === '待核对').length)

  watch([devices, rules, revision, locked, acceptedChanges, batches, conflicts, rollbacks, revisions], () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      devices: devices.value,
      rules: rules.value,
      revision: revision.value,
      locked: locked.value,
      acceptedChanges: acceptedChanges.value,
      batches: batches.value,
      conflicts: conflicts.value,
      rollbacks: rollbacks.value,
      revisions: revisions.value,
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

  // ---- 批次合并 ----

  function nextBatchCode() {
    const n = batches.value.length + 1
    return `B-2026-09-${String(n).padStart(2, '0')}`
  }

  function createBatch(source: string, deviceChanges: DeviceChange[], ruleChanges: RuleChange[], note?: string): Batch {
    const batch: Batch = {
      id: `B-${String(batches.value.length + 1).padStart(2, '0')}`,
      code: nextBatchCode(),
      source,
      bornRevision: revision.value,
      createdAt: nowIso(),
      status: '待合并',
      appliedCount: 0,
      retryCount: 0,
      deviceChanges,
      ruleChanges,
      note,
    }
    batches.value.push(batch)
    return batch
  }

  function createConflict(ruleId: string, field: string, batchIds: string[], reason: string): BatchConflict {
    const conflict: BatchConflict = {
      id: `C-${String(conflicts.value.length + 1).padStart(2, '0')}`,
      ruleId,
      field,
      batchIds: [...batchIds],
      status: '待核对',
      reason,
    }
    conflicts.value.push(conflict)
    return conflict
  }

  function linkConflict(ruleId: string, field: string, batchId: string, reason: string) {
    const existing = conflicts.value.find((c) => c.ruleId === ruleId && c.field === field)
    if (existing) {
      if (!existing.batchIds.includes(batchId)) existing.batchIds.push(batchId)
      return
    }
    createConflict(ruleId, field, [batchId], reason)
  }

  // 合并批次到当前审阅基线。字段级合并：非冲突字段立即并入，冲突字段转待核对。
  function mergeBatch(batchId: string): { ok: boolean; conflict?: boolean; invalid?: boolean; reason?: string } {
    const batch = batches.value.find((b) => b.id === batchId)
    if (!batch) return { ok: false, reason: '批次不存在' }
    if (batch.status === '已合并' || batch.status === '已核对' || batch.status === '已回滚') return { ok: false, reason: '批次已处理' }
    if (batch.status === '已失效') return { ok: false, invalid: true, reason: batch.invalidReason }

    // 1. 点位校验：移除或跨区变化 → 关联批次失效，需重新确认
    for (const dc of batch.deviceChanges) {
      if (dc.kind === 'remove') {
        const referenced = rules.value.filter((r) => r.triggerId === dc.deviceId || r.actionId === dc.deviceId)
        if (referenced.length) {
          batch.status = '已失效'
          batch.invalidReason = `点位 ${dc.deviceId} 被移除，关联规则 ${referenced.map((r) => r.id).join('、')} 悬空，需重新确认`
          return { ok: false, invalid: true, reason: batch.invalidReason }
        }
      }
      if (dc.kind === 'update' && dc.zoneChanged) {
        const referenced = rules.value.filter((r) => r.triggerId === dc.deviceId || r.actionId === dc.deviceId)
        if (referenced.length) {
          batch.status = '已失效'
          batch.invalidReason = `点位 ${dc.deviceId} 跨区变化，关联规则 ${referenced.map((r) => r.id).join('、')} 需重新确认`
          return { ok: false, invalid: true, reason: batch.invalidReason }
        }
      }
    }

    // 2. 应用点位变更（新增 / 安全更新）
    let applied = 0
    for (const dc of batch.deviceChanges) {
      if (dc.kind === 'add') {
        if (dc.after && !devices.value.find((d) => d.id === dc.deviceId)) {
          devices.value.push(deepClone(dc.after))
          applied += 1
        }
      } else if (dc.kind === 'update' && dc.afterPatch) {
        const dev = devices.value.find((d) => d.id === dc.deviceId)
        if (dev) {
          Object.assign(dev, dc.afterPatch)
          applied += 1
        }
      }
    }

    // 3. 规则字段级合并
    let hasOpenConflict = false
    let hasLateConflict = false
    const conflictNotes: string[] = []
    for (const rc of batch.ruleChanges) {
      if (rc.kind === 'add') {
        if (rc.after && !rules.value.find((r) => r.id === rc.ruleId)) {
          rules.value.push(deepClone(rc.after))
          applied += 1
        }
        continue
      }
      if (rc.kind === 'remove') {
        const idx = rules.value.findIndex((r) => r.id === rc.ruleId)
        if (idx >= 0) {
          rules.value.splice(idx, 1)
          applied += 1
        }
        continue
      }
      const rule = rules.value.find((r) => r.id === rc.ruleId)
      if (!rule) {
        // 规则不在基线 → 合并失败，保留原批次
        batch.status = '合并失败'
        batch.failReason = `规则 ${rc.ruleId} 不在当前基线，可能已被其他批次移除`
        return { ok: false, reason: batch.failReason }
      }
      for (const field of (rc.fields ?? [])) {
        const newValue = (rc.afterPatch ?? {})[field]
        const currentValue = (rule as Record<string, unknown>)[field]
        // 已核对内容不能盖掉：晚到批次直接驳回
        const verified = conflicts.value.find((c) => c.ruleId === rc.ruleId && c.field === field && c.status === '已核对')
        if (verified) {
          hasLateConflict = true
          conflictNotes.push(`${rc.ruleId}.${field} 已核对为 ${verified.resolution}，晚到批次不能盖掉`)
          linkConflict(rc.ruleId, field, batch.id, conflictNotes[conflictNotes.length - 1])
          batch.rejectedFields = [...(batch.rejectedFields ?? []), `${rc.ruleId}.${field}`]
          continue
        }
        // 已有待核对冲突：加入冲突方，等待核对
        const pending = conflicts.value.find((c) => c.ruleId === rc.ruleId && c.field === field && c.status === '待核对')
        if (pending) {
          hasOpenConflict = true
          conflictNotes.push(`${rc.ruleId}.${field} 待核对`)
          if (!pending.batchIds.includes(batch.id)) pending.batchIds.push(batch.id)
          continue
        }
        // 已合并批次同字段且值不同 → 发起核对（冲突由后到批次触发）
        const mergedBatch = batches.value.find(
          (b) => b.status === '已合并' && b.ruleChanges.some((r) => r.ruleId === rc.ruleId && (r.fields ?? []).includes(field)),
        )
        if (mergedBatch && currentValue !== newValue) {
          hasOpenConflict = true
          conflictNotes.push(`${rc.ruleId}.${field} 已被 ${mergedBatch.code} 修改，需核对`)
          createConflict(rc.ruleId, field, [batch.id, mergedBatch.id], `${rc.ruleId}.${field} 与已合并批次 ${mergedBatch.code} 冲突`)
          continue
        }
        // 应用该字段
        ;(rule as Record<string, unknown>)[field] = newValue
        applied += 1
      }
    }

    batch.appliedCount = applied
    if (hasOpenConflict) {
      batch.status = '待核对'
      batch.conflictReason = conflictNotes.join('；')
      if (applied > 0) {
        revision.value += 1
        batch.mergedRevision = revision.value
      }
      return { ok: false, conflict: true, reason: batch.conflictReason }
    }

    if (hasLateConflict) {
      // 晚到批次：冲突字段已驳回，其余字段正常并入
      batch.status = applied > 0 ? '已合并' : '已核对'
      batch.conflictReason = conflictNotes.join('；')
      if (applied > 0) {
        revision.value += 1
        batch.mergedRevision = revision.value
      }
      return { ok: true }
    }

    if (applied === 0) {
      batch.status = '已核对'
      batch.mergedAt = nowIso()
      return { ok: true }
    }

    batch.status = '已合并'
    batch.mergedAt = nowIso()
    revision.value += 1
    batch.mergedRevision = revision.value
    return { ok: true }
  }

  // 重试合并失败批次：恢复网络后接着处理，重试不新增版本
  function retryMerge(batchId: string) {
    const batch = batches.value.find((b) => b.id === batchId)
    if (!batch || batch.status !== '合并失败') return
    batch.retryCount += 1
    batch.failReason = undefined
    mergeBatch(batchId)
  }

  // 核对冲突：选择胜出批次的值，落败批次该字段驳回
  function resolveConflict(conflictId: string, winningBatchId: string) {
    const conflict = conflicts.value.find((c) => c.id === conflictId)
    if (!conflict || conflict.status === '已核对') return
    const winner = batches.value.find((b) => b.id === winningBatchId)
    if (!winner) return
    const winningChange = winner.ruleChanges.find((r) => r.ruleId === conflict.ruleId && (r.fields ?? []).includes(conflict.field as keyof Rule))
    const value = winningChange?.afterPatch?.[conflict.field as keyof Rule]
    const rule = rules.value.find((r) => r.id === conflict.ruleId)
    if (rule && value !== undefined) (rule as Record<string, unknown>)[conflict.field] = value

    conflict.status = '已核对'
    conflict.resolution = String(value)
    conflict.winningBatchId = winningBatchId
    conflict.resolvedAt = nowIso()

    conflict.batchIds.forEach((bid) => {
      const b = batches.value.find((x) => x.id === bid)
      if (!b) return
      if (bid === winningBatchId) {
        if (b.status === '待核对') {
          b.status = b.appliedCount > 0 ? '已合并' : '已核对'
          b.conflictReason = undefined
          b.mergedAt = b.mergedAt ?? nowIso()
        }
      } else {
        // 落败批次：该字段被驳回（已合并批次字段被覆盖同样留痕）
        b.rejectedFields = [...(b.rejectedFields ?? []), `${conflict.ruleId}.${conflict.field}`]
        if (b.status === '待核对') {
          b.status = b.appliedCount > 0 ? '已合并' : '已核对'
          b.conflictReason = undefined
          b.mergedAt = b.mergedAt ?? nowIso()
        }
      }
    })
    revision.value += 1
  }

  // 回滚已合并批次：反向恢复字段并记录回滚
  function rollbackBatch(batchId: string, reason = '手动回滚') {
    const batch = batches.value.find((b) => b.id === batchId)
    if (!batch || batch.status !== '已合并') return
    for (const rc of batch.ruleChanges) {
      if (rc.kind === 'update' && rc.before) {
        const rule = rules.value.find((r) => r.id === rc.ruleId)
        if (rule) {
          for (const field of (rc.fields ?? [])) {
            ;(rule as Record<string, unknown>)[field] = (rc.before as Record<string, unknown>)[field]
          }
        }
      } else if (rc.kind === 'add') {
        const idx = rules.value.findIndex((r) => r.id === rc.ruleId)
        if (idx >= 0) rules.value.splice(idx, 1)
      } else if (rc.kind === 'remove' && rc.before) {
        if (!rules.value.find((r) => r.id === rc.ruleId)) rules.value.push(deepClone(rc.before))
      }
    }
    for (const dc of batch.deviceChanges) {
      if (dc.kind === 'add') {
        const idx = devices.value.findIndex((d) => d.id === dc.deviceId)
        if (idx >= 0) devices.value.splice(idx, 1)
      } else if (dc.kind === 'remove' && dc.before) {
        if (!devices.value.find((d) => d.id === dc.deviceId)) devices.value.push(deepClone(dc.before))
      } else if (dc.kind === 'update' && dc.before) {
        const dev = devices.value.find((d) => d.id === dc.deviceId)
        if (dev) Object.assign(dev, dc.before)
      }
    }
    batch.status = '已回滚'
    rollbacks.value.unshift({
      id: `RB-${String(rollbacks.value.length + 1).padStart(2, '0')}`,
      batchId: batch.id,
      batchCode: batch.code,
      revision: revision.value,
      rolledBackAt: nowIso(),
      reason,
    })
    revision.value += 1
  }

  // 基线签字：归档当前基线为旧版，生成新修订草稿
  function lockBaseline() {
    if (locked.value) return
    revisions.value.unshift({
      revision: revision.value,
      signedAt: nowIso(),
      note: `基线 R${revision.value} 签字锁定`,
      locked: true,
      devices: deepClone(devices.value),
      rules: deepClone(rules.value),
      batchIds: batches.value.filter((b) => b.status === '已合并' || b.status === '已核对').map((b) => b.id),
    })
    revision.value += 1
    locked.value = false
  }

  function unlock() {
    locked.value = false
  }

  function batchTouchesRule(ruleId: string): Batch | undefined {
    return batches.value.find((b) => b.ruleChanges.some((r) => r.ruleId === ruleId))
  }

  function batchTouchesDevice(deviceId: string): Batch | undefined {
    return batches.value.find((b) => b.deviceChanges.some((d) => d.deviceId === deviceId))
  }

  return {
    devices,
    rules,
    revision,
    locked,
    acceptedChanges,
    selectedRuleIds,
    batches,
    conflicts,
    rollbacks,
    revisions,
    validations,
    pendingBatchCount,
    openConflictCount,
    updateRule,
    addRule,
    batchUpdate,
    toggleSelected,
    createBatch,
    mergeBatch,
    retryMerge,
    resolveConflict,
    rollbackBatch,
    lockBaseline,
    unlock,
    batchTouchesRule,
    batchTouchesDevice,
  }
})
