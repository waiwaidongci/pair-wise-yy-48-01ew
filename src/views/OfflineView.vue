<script setup lang="ts">
import { computed } from 'vue'
import { useLinkageStore, batchStatusColor, fieldLabels, type OfflineBatch } from '../stores/linkage'

const store = useLinkageStore()

const counts = computed(() => ({
  待合并: store.batches.filter((batch) => batch.status === '待合并').length,
  待核对: store.batches.filter((batch) => batch.status === '待核对').length,
  已失效: store.batches.filter((batch) => batch.status === '已失效').length,
  合并失败: store.batches.filter((batch) => batch.status === '合并失败').length,
}))

function currentRuleValue(ruleId: string, field: string): unknown {
  const rule = store.rules.find((item) => item.id === ruleId)
  return rule ? (rule as unknown as Record<string, unknown>)[field] : '规则已删除'
}

function currentDeviceValue(deviceId: string, field: string): unknown {
  const device = store.devices.find((item) => item.id === deviceId)
  return device ? (device as unknown as Record<string, unknown>)[field] : '点位已移除'
}

function formatValue(field: string, value: unknown): string {
  if (field === 'enabled') return value ? '启用' : '停用'
  if (field === 'delay') return `${value}s`
  return String(value)
}

function fieldEntries(fields: Record<string, unknown>) {
  return Object.entries(fields)
}

function statusHint(batch: OfflineBatch): string {
  if (batch.status === '合并失败') return `网络中断，原批次已保留，重试 ${batch.retryCount} 次（不新增版本）`
  if (batch.status === '已失效') return batch.invalidReason
  if (batch.status === '待核对') return `${batch.conflicts.filter((item) => !item.resolution).length} 处冲突待核对`
  if (batch.status === '已合并') return batch.verified ? '已核对，字段受保护' : '已合并，待核对确认'
  return ''
}
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div>
        <p class="eyebrow">OFFLINE SYNC / 离线批次</p>
        <h1>断网现场批次的合并与核对</h1>
        <p class="muted">每批保留出生版本；同一规则多批改动只合并各自字段，延时、互锁、启停冲突转待核对，晚到批次不覆盖已核对内容。</p>
      </div>
      <div class="actions">
        <v-switch
          :model-value="store.online"
          :label="store.online ? '已回网 · 可以合并' : '断网中'"
          :color="store.online ? 'success' : 'error'"
          hide-details
          density="compact"
          inset
          @update:model-value="store.online = Boolean($event)"
        />
        <v-btn color="primary" prepend-icon="mdi-plus-box-outline" :disabled="store.locked" @click="store.addSimulatedBatch">模拟现场批次</v-btn>
      </div>
    </div>

    <v-alert v-if="!store.online" type="error" variant="tonal" density="compact" class="mb-3">
      当前断网：合并请求会保留原批次并标记为合并失败，恢复网络后接着处理，重试不新增版本。
    </v-alert>

    <div class="status-strip panel">
      <div><span>待合并</span><strong>{{ counts.待合并 }}</strong></div>
      <div><span>待核对</span><strong class="warn">{{ counts.待核对 }}</strong></div>
      <div><span>已失效</span><strong class="bad">{{ counts.已失效 }}</strong></div>
      <div><span>合并失败</span><strong class="bad">{{ counts.合并失败 }}</strong></div>
      <div class="strip-note">当前基线 R{{ store.revision }} · {{ store.locked ? '已签字锁定' : '协同编辑中' }}</div>
    </div>

    <article v-for="batch in store.batches" :key="batch.id" class="panel batch-card">
      <header>
        <v-chip size="small" :color="batchStatusColor(batch.status) || undefined" variant="tonal">{{ batch.status }}</v-chip>
        <v-chip v-if="batch.verified" size="small" color="success" variant="outlined" prepend-icon="mdi-shield-check-outline">已核对</v-chip>
        <div class="batch-title">
          <strong>{{ batch.id }} · {{ batch.title }}</strong>
          <small>{{ batch.author }} · {{ batch.createdAt }} · 出生版本 R{{ batch.baseRevision }}</small>
        </div>
        <span v-if="statusHint(batch)" class="hint">{{ statusHint(batch) }}</span>
        <div class="batch-actions">
          <v-btn v-if="batch.status === '待合并'" size="small" color="primary" variant="tonal" prepend-icon="mdi-source-merge" @click="store.mergeBatch(batch.id)">合并到基线</v-btn>
          <v-btn v-if="batch.status === '合并失败'" size="small" color="warning" variant="tonal" prepend-icon="mdi-refresh" :disabled="!store.online" @click="store.mergeBatch(batch.id)">重试合并</v-btn>
          <v-btn v-if="batch.status === '已失效'" size="small" color="secondary" variant="tonal" prepend-icon="mdi-account-check-outline" @click="store.reconfirmBatch(batch.id)">重新确认</v-btn>
          <template v-if="batch.status === '已合并'">
            <v-btn v-if="!batch.verified" size="small" color="success" variant="tonal" prepend-icon="mdi-check-decagram-outline" @click="store.verifyBatch(batch.id)">核对通过</v-btn>
            <v-btn size="small" color="error" variant="text" prepend-icon="mdi-undo-variant" @click="store.rollbackBatch(batch.id)">回滚</v-btn>
          </template>
        </div>
      </header>

      <div class="change-grid">
        <div v-if="batch.ruleChanges.length" class="change-col">
          <h4>规则字段改动</h4>
          <p v-for="change in batch.ruleChanges" :key="change.ruleId">
            <template v-for="[field, value] in fieldEntries(change.fields)" :key="field">
              <code>{{ change.ruleId }}</code> · {{ fieldLabels[field] }}：基线 {{ formatValue(field, currentRuleValue(change.ruleId, field)) }} → 批次 {{ formatValue(field, value) }}<br />
            </template>
          </p>
        </div>
        <div v-if="batch.deviceChanges.length" class="change-col">
          <h4>点位改动</h4>
          <p v-for="change in batch.deviceChanges" :key="change.deviceId">
            <template v-for="[field, value] in fieldEntries(change.fields)" :key="field">
              <code>{{ change.deviceId }}</code> · {{ fieldLabels[field] }}：台账 {{ formatValue(field, currentDeviceValue(change.deviceId, field)) }} → 批次 {{ formatValue(field, value) }}<br />
            </template>
          </p>
        </div>
        <div v-if="batch.applied.length" class="change-col">
          <h4>已落基线 {{ batch.applied.length }} 处</h4>
          <p v-for="(change, index) in batch.applied" :key="index">
            <code>{{ change.targetId }}</code> · {{ fieldLabels[change.field] }}：{{ formatValue(change.field, change.prev) }} → {{ formatValue(change.field, change.next) }}
          </p>
        </div>
      </div>

      <div v-if="batch.conflicts.length" class="conflict-list">
        <h4><v-icon icon="mdi-alert-circle-outline" size="16" /> 冲突待核对（{{ batch.conflicts.filter((item) => !item.resolution).length }}/{{ batch.conflicts.length }}）</h4>
        <div v-for="(conflict, index) in batch.conflicts" :key="index" class="conflict-row">
          <div>
            <strong>{{ conflict.ruleId }} · {{ fieldLabels[conflict.field] }}</strong>
            <p>基线 {{ formatValue(conflict.field, conflict.currentValue) }} ／ 批次 {{ formatValue(conflict.field, conflict.batchValue) }} — {{ conflict.reason }}</p>
          </div>
          <div v-if="!conflict.resolution && batch.status === '待核对'" class="conflict-actions">
            <v-btn size="x-small" color="primary" variant="tonal" @click="store.resolveConflict(batch.id, index, true)">采用批次值</v-btn>
            <v-btn size="x-small" variant="outlined" @click="store.resolveConflict(batch.id, index, false)">保留基线值</v-btn>
          </div>
          <v-chip v-else-if="conflict.resolution" size="x-small" :color="conflict.resolution === '采用批次值' ? 'primary' : 'secondary'" variant="tonal">{{ conflict.resolution }}</v-chip>
        </div>
      </div>
    </article>

    <div v-if="store.batches.length === 0" class="panel empty">
      <v-icon icon="mdi-cloud-off-outline" size="40" color="secondary" />
      <strong>暂无离线批次</strong>
      <span>现场断网修改点位或规则字段后，回网会在此合并到审阅基线。</span>
    </div>
  </section>
</template>

<style scoped>
.actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.status-strip { display: flex; align-items: center; gap: 26px; margin-bottom: 14px; padding: 12px 18px; flex-wrap: wrap; }
.status-strip > div { display: flex; align-items: baseline; gap: 8px; }
.status-strip span { color: #758187; font-size: 12px; }
.status-strip strong { font-size: 20px; color: #293e45; }
.status-strip .warn { color: #bd7928; }
.status-strip .bad { color: #b23e2a; }
.strip-note { margin-left: auto; color: #849096; font-size: 12px; }
.batch-card { margin-bottom: 12px; padding-bottom: 4px; }
.batch-card header { display: flex; align-items: center; gap: 10px; padding: 13px 16px; border-bottom: 1px solid #edf0f0; flex-wrap: wrap; }
.batch-title { display: grid; }
.batch-title small { color: #7f8b90; }
.hint { color: #9a6a2b; font-size: 12px; }
.batch-actions { margin-left: auto; display: flex; gap: 8px; }
.change-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 4px 22px; padding: 10px 16px; }
.change-col h4, .conflict-list h4 { margin: 6px 0; font-size: 12px; color: #5d6d74; letter-spacing: .06em; }
.change-col p { margin: 4px 0; color: #4c5c63; font-size: 12px; line-height: 1.7; }
.change-col code { color: #267078; font-weight: 700; }
.conflict-list { margin: 4px 16px 14px; padding: 10px 14px; border: 1px dashed #df9a4d; border-radius: 8px; background: #fdf6ec; }
.conflict-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid #f3e2c8; }
.conflict-row:last-child { border-bottom: none; }
.conflict-row p { margin: 3px 0 0; color: #8a6a3c; font-size: 12px; }
.conflict-actions { display: flex; gap: 6px; flex-shrink: 0; }
.empty { display: grid; justify-items: center; gap: 8px; padding: 46px; color: #3d5a63; }
.empty span { color: #748086; font-size: 12px; }
</style>
