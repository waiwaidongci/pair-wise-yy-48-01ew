<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLinkageStore, type Batch } from '../stores/linkage'

const store = useLinkageStore()
const tab = ref('batches')

const checklist = ref([
  { done: true, title: '设备地址与竣工图一致', owner: '消防电专业' },
  { done: true, title: '所有报警点完成单点调试', owner: '调试组' },
  { done: false, title: '跨区联动完成现场确认', owner: '消防审阅人' },
  { done: false, title: '互锁反馈时长完成测试', owner: '暖通专业' },
  { done: false, title: '签字交付包完成哈希校验', owner: '项目负责人' },
])
const changes = [
  { id: 'CH-01', title: 'PF-2 增加防火阀开启反馈互锁', source: '暖通专业', oldValue: '互锁：无', newValue: '互锁：防火阀开启反馈', risk: '低' },
  { id: 'CH-02', title: '电梯归位延时由 0 秒调整至 10 秒', source: '电梯专业', oldValue: '延时：0s', newValue: '延时：10s', risk: '中' },
  { id: 'CH-03', title: '机房感烟联动 1F 排烟风机', source: '智能化专业', oldValue: '无关系', newValue: 'R-007 / 当前停用', risk: '高' },
]
const canLock = computed(() => store.validations.filter((item) => item.severity === '错误').length === 0 && checklist.value.every((item) => item.done))

const statusColor: Record<Batch['status'], string> = {
  待合并: 'primary',
  已合并: 'success',
  待核对: 'warning',
  已核对: 'success',
  已失效: 'error',
  合并失败: 'error',
  已回滚: 'info',
}

function accept(id: string) {
  if (!store.acceptedChanges.includes(id)) store.acceptedChanges.push(id)
}

function merge(batch: Batch) {
  store.mergeBatch(batch.id)
}

function retry(batch: Batch) {
  store.retryMerge(batch.id)
}

function rollback(batch: Batch) {
  store.rollbackBatch(batch.id)
}

function fieldLabel(field: string): string {
  const map: Record<string, string> = { delay: '延时', interlock: '互锁', priority: '优先级', suppression: '抑制', enabled: '启停' }
  return map[field] ?? field
}

function batchSummary(batch: Batch): string {
  const parts: string[] = []
  for (const dc of batch.deviceChanges) {
    if (dc.kind === 'add') parts.push(`新增点位 ${dc.deviceId}`)
    else if (dc.kind === 'remove') parts.push(`移除点位 ${dc.deviceId}`)
    else parts.push(`点位 ${dc.deviceId} 更新`)
  }
  for (const rc of batch.ruleChanges) {
    if (rc.kind === 'add') parts.push(`新增规则 ${rc.ruleId}`)
    else if (rc.kind === 'remove') parts.push(`移除规则 ${rc.ruleId}`)
    else parts.push(`${rc.ruleId} ${(rc.fields ?? []).map(fieldLabel).join('/')}`)
  }
  return parts.join('；')
}

function exportPackage() {
  const payload = JSON.stringify({ revision: store.revision, devices: store.devices, rules: store.rules, validations: store.validations, acceptedChanges: store.acceptedChanges, batches: store.batches, conflicts: store.conflicts, rollbacks: store.rollbacks, revisions: store.revisions }, null, 2)
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `消防联动交付包-R${store.revision}.json`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <section class="page">
    <div class="page-head">
      <div>
        <p class="eyebrow">REVIEW & SIGN-OFF / 审阅签字</p>
        <h1>批次合并、版本差异与签字锁定</h1>
        <p class="muted">现场断网改点回网后按字段级合并；延时、互锁、启停冲突转待核对，晚到批次不能盖掉已核对内容。</p>
      </div>
      <div class="actions">
        <v-btn variant="outlined" prepend-icon="mdi-download" @click="exportPackage">导出交付包</v-btn>
        <v-btn v-if="!store.locked" color="primary" prepend-icon="mdi-lock-outline" :disabled="!canLock" @click="store.lockBaseline">签字锁定</v-btn>
        <v-btn v-else color="warning" variant="outlined" @click="store.unlock">解锁修订</v-btn>
      </div>
    </div>

    <v-alert v-if="!canLock && !store.locked" type="warning" variant="tonal" class="mb-3">签字前需清除所有错误规则并完成联调清单。</v-alert>
    <v-alert v-if="store.locked" type="success" variant="tonal" class="mb-3">当前版本 R{{ store.revision }} 已签字锁定，任何修改都会生成新的修订草稿。</v-alert>

    <v-tabs v-model="tab" class="mb-3">
      <v-tab value="batches">批次合并<v-badge v-if="store.openConflictCount" :content="store.openConflictCount" color="error" inline class="ml-2" /></v-tab>
      <v-tab value="check">校验与清单</v-tab>
      <v-tab value="history">版本历史</v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <!-- 批次合并 -->
      <v-window-item value="batches">
        <section class="panel mb-3">
          <div class="panel-head">
            <h3>离线批次（出生版本 → 合并版本）</h3>
            <v-chip size="small" variant="tonal">待合并 {{ store.pendingBatchCount }} · 待核对 {{ store.openConflictCount }}</v-chip>
          </div>
          <v-table>
            <thead><tr><th>批次号</th><th>来源</th><th>出生版本</th><th>变更摘要</th><th>状态</th><th>合并版本</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="batch in store.batches" :key="batch.id">
                <td class="mono"><strong>{{ batch.code }}</strong></td>
                <td>{{ batch.source }}<br /><small class="muted">{{ batch.createdAt }}</small></td>
                <td><v-chip size="x-small" variant="outlined">R{{ batch.bornRevision }}</v-chip></td>
                <td class="summary-cell">
                  {{ batchSummary(batch) }}
                  <div v-if="batch.invalidReason" class="reason invalid">{{ batch.invalidReason }}</div>
                  <div v-if="batch.failReason" class="reason fail">{{ batch.failReason }}（重试 {{ batch.retryCount }} 次）</div>
                  <div v-if="batch.conflictReason" class="reason conflict">{{ batch.conflictReason }}</div>
                  <div v-if="batch.rejectedFields?.length" class="reason rejected">驳回字段：{{ batch.rejectedFields.join('、') }}</div>
                </td>
                <td><v-chip size="small" :color="statusColor[batch.status]" variant="tonal">{{ batch.status }}</v-chip></td>
                <td>
                  <v-chip v-if="batch.mergedRevision" size="x-small" color="success" variant="outlined">R{{ batch.mergedRevision }}</v-chip>
                  <span v-else class="muted">—</span>
                </td>
                <td class="actions-cell">
                  <v-btn v-if="batch.status === '待合并'" size="small" color="primary" variant="tonal" @click="merge(batch)">合并</v-btn>
                  <v-btn v-if="batch.status === '合并失败'" size="small" color="warning" variant="tonal" prepend-icon="mdi-refresh" @click="retry(batch)">重试</v-btn>
                  <v-btn v-if="batch.status === '已合并'" size="small" color="info" variant="text" prepend-icon="mdi-undo" @click="rollback(batch)">回滚</v-btn>
                  <span v-if="batch.status === '已失效' || batch.status === '已回滚'" class="muted">—</span>
                </td>
              </tr>
            </tbody>
          </v-table>
        </section>

        <section class="panel">
          <div class="panel-head"><h3>冲突核对（延时 / 互锁 / 启停）</h3><v-chip size="small" color="warning" variant="tonal">{{ store.openConflictCount }} 项待核对</v-chip></div>
          <div class="conflict-list">
            <article v-for="c in store.conflicts" :key="c.id" :class="c.status">
              <div class="conflict-head">
                <v-chip size="x-small" :color="c.status === '已核对' ? 'success' : 'warning'" variant="tonal">{{ c.status }}</v-chip>
                <strong>{{ c.ruleId }} · {{ fieldLabel(c.field) }}</strong>
                <span class="muted">涉及批次 {{ c.batchIds.join('、') }}</span>
              </div>
              <p class="muted">{{ c.reason }}</p>
              <div v-if="c.status === '待核对'" class="conflict-actions">
                <span class="muted">选择保留哪批的值：</span>
                <v-btn v-for="bid in c.batchIds" :key="bid" size="small" variant="tonal" @click="store.resolveConflict(c.id, bid)">
                  保留 {{ store.batches.find((b) => b.id === bid)?.code }}（{{ store.batches.find((b) => b.id === bid)?.source }}）
                </v-btn>
              </div>
              <div v-else class="resolved muted">已核对：保留 {{ store.batches.find((b) => b.id === c.winningBatchId)?.code }} 的值 = {{ c.resolution }}（{{ c.resolvedAt }}）</div>
            </article>
            <div v-if="store.conflicts.length === 0" class="empty-validation">
              <v-icon icon="mdi-check-decagram" size="38" color="success" /><strong>暂无冲突</strong><span>多批改动按字段各自合并，无延时/互锁/启停冲突。</span>
            </div>
          </div>
        </section>
      </v-window-item>

      <!-- 校验与清单 -->
      <v-window-item value="check">
        <div class="review-grid">
          <section class="panel">
            <div class="panel-head"><h3>矩阵校验结果</h3><v-chip size="small" color="error" variant="tonal">{{ store.validations.length }} 项</v-chip></div>
            <div class="validation-list">
              <article v-for="item in store.validations" :key="item.id" :class="item.severity">
                <v-icon :icon="item.severity === '错误' ? 'mdi-close-octagon-outline' : 'mdi-alert-outline'" />
                <div><strong>{{ item.title }}</strong><p>{{ item.detail }}</p><small>建议：{{ item.suggestion }}</small></div>
                <v-btn size="small" variant="text" @click="$router.push('/matrix')">定位</v-btn>
              </article>
              <div v-if="store.validations.length === 0" class="empty-validation"><v-icon icon="mdi-check-decagram" size="38" color="success" /><strong>矩阵校验通过</strong><span>未发现遗漏、重复、矛盾或跨区冲突。</span></div>
            </div>
          </section>

          <aside>
            <section class="panel">
              <div class="panel-head"><h3>联调清单</h3><span class="muted">{{ checklist.filter((item) => item.done).length }}/{{ checklist.length }}</span></div>
              <div class="checklist">
                <v-checkbox v-for="item in checklist" :key="item.title" v-model="item.done" :label="item.title" :hint="item.owner" persistent-hint density="compact" />
              </div>
            </section>
          </aside>
        </div>

        <section class="panel change-panel">
          <div class="panel-head"><h3>专业提交版本差异</h3><span class="muted">可逐项接受</span></div>
          <v-table>
            <thead><tr><th>变更</th><th>来源</th><th>原始值</th><th>提交值</th><th>风险</th><th>决定</th></tr></thead>
            <tbody>
              <tr v-for="change in changes" :key="change.id">
                <td><strong>{{ change.id }}</strong><br />{{ change.title }}</td>
                <td>{{ change.source }}</td>
                <td class="old">{{ change.oldValue }}</td>
                <td class="new">{{ change.newValue }}</td>
                <td><v-chip size="small" :color="change.risk === '高' ? 'error' : change.risk === '中' ? 'warning' : 'success'" variant="tonal">{{ change.risk }}</v-chip></td>
                <td><v-btn v-if="!store.acceptedChanges.includes(change.id)" size="small" color="primary" variant="tonal" @click="accept(change.id)">接受变更</v-btn><v-chip v-else color="success" variant="tonal" prepend-icon="mdi-check">已接受</v-chip></td>
              </tr>
            </tbody>
          </v-table>
        </section>
      </v-window-item>

      <!-- 版本历史 -->
      <v-window-item value="history">
        <section class="panel mb-3">
          <div class="panel-head"><h3>旧版基线</h3><span class="muted">签字后归档，可查看快照</span></div>
          <div class="revision-list">
            <article v-for="rev in store.revisions" :key="rev.revision" class="revision-card">
              <div class="revision-head">
                <v-chip size="small" color="success" variant="tonal">R{{ rev.revision }}</v-chip>
                <strong>{{ rev.note }}</strong>
                <span class="muted">{{ rev.signedAt }}</span>
              </div>
              <div class="revision-meta muted">
                含 {{ rev.devices.length }} 点位 / {{ rev.rules.length }} 规则 · 批次 {{ rev.batchIds.length ? rev.batchIds.join('、') : '—' }}
              </div>
            </article>
            <div v-if="store.revisions.length === 0" class="empty-validation">
              <v-icon icon="mdi-history" size="38" color="success" /><strong>暂无旧版</strong><span>签字锁定后在此归档历史基线。</span>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h3>回滚记录</h3><span class="muted">批次回滚留痕</span></div>
          <v-table>
            <thead><tr><th>回滚单号</th><th>批次</th><th>回滚时版本</th><th>时间</th><th>原因</th></tr></thead>
            <tbody>
              <tr v-for="rb in store.rollbacks" :key="rb.id">
                <td class="mono">{{ rb.id }}</td>
                <td class="mono">{{ rb.batchCode }}</td>
                <td><v-chip size="x-small" variant="outlined">R{{ rb.revision }}</v-chip></td>
                <td class="muted">{{ rb.rolledBackAt }}</td>
                <td>{{ rb.reason }}</td>
              </tr>
              <tr v-if="store.rollbacks.length === 0"><td colspan="5" class="muted empty-row">暂无回滚记录</td></tr>
            </tbody>
          </v-table>
        </section>
      </v-window-item>
    </v-window>
  </section>
</template>

<style scoped>
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.review-grid { display: grid; grid-template-columns: minmax(0,1fr) 350px; gap: 14px; margin-bottom: 14px; }
.validation-list { padding: 8px 16px 16px; }
.validation-list article { display: grid; grid-template-columns: 28px 1fr auto; gap: 10px; padding: 13px 0; border-bottom: 1px solid #edf0f0; }
.validation-list article.error { color: #b13d2c; }
.validation-list article.warning { color: #b87b22; }
.validation-list strong { font-size: 13px; }
.validation-list p { margin: 5px 0; color: #59676d; font-size: 12px; line-height: 1.5; }
.validation-list small { color: #7f8b90; }
.empty-validation { display: grid; justify-items: center; gap: 7px; padding: 42px; color: #3d7b63; }
.empty-validation span { color: #748086; font-size: 12px; }
.checklist { padding: 10px 14px 16px; }
.change-panel { overflow-x: auto; }
.change-panel :deep(table) { min-width: 850px; }
.old { color: #a54b35; }
.new { color: #2e755e; font-weight: 700; }
.mono { color: #267078; font-family: ui-monospace,monospace; font-weight: 700; }
.summary-cell { font-size: 12px; }
.reason { margin-top: 4px; font-size: 11px; }
.reason.invalid { color: #b23e2a; }
.reason.fail { color: #b23e2a; }
.reason.conflict { color: #bd7928; }
.reason.rejected { color: #6b7280; }
.actions-cell { white-space: nowrap; }
.conflict-list { padding: 8px 16px 16px; }
.conflict-list article { padding: 13px 0; border-bottom: 1px solid #edf0f0; }
.conflict-list article.resolved { opacity: .85; }
.conflict-head { display: flex; align-items: center; gap: 10px; }
.conflict-head strong { font-size: 13px; }
.conflict-list p { margin: 6px 0; font-size: 12px; }
.conflict-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
.resolved { margin-top: 6px; font-size: 12px; }
.revision-list { padding: 8px 16px 16px; display: grid; gap: 10px; }
.revision-card { padding: 12px 14px; border: 1px solid #e7ebeb; border-radius: 8px; }
.revision-head { display: flex; align-items: center; gap: 10px; }
.revision-head strong { font-size: 13px; }
.revision-meta { margin-top: 6px; font-size: 12px; }
.empty-row { text-align: center; padding: 24px; }
@media (max-width: 1000px) { .review-grid { grid-template-columns: 1fr; } }
</style>
