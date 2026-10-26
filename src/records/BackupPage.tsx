import { useEffect, useRef, useState } from 'react';
import { contentRepository } from '../content/repository';
import { Dialog } from '../ui/Dialog';
import { personalStore } from './store';
import { MAX_BACKUP_BYTES } from './validation';
import type { GuideTarget, ImportChoice, ImportPreview, PersonalBackup, StoreName } from './types';
import './records.css';

const labels: Record<StoreName, string> = { notes: '笔记', explorations: '探索', resume: '阅读位置', guideStates: '导读阅读标记', originalStates: '原文阅读标记' };
const names = Object.keys(labels) as StoreName[];
const available = (target: GuideTarget) => Boolean(contentRepository.get(target.guideId, target.revision)?.units.some(unit => unit.id === target.unitId));
const message = (error: unknown) => error instanceof Error ? error.message : '操作未完成，请保留原备份并重试。';

export function BackupPage() {
  const [snapshot, setSnapshot] = useState<PersonalBackup>();
  const [preview, setPreview] = useState<ImportPreview>();
  const [choices, setChoices] = useState<Record<string, ImportChoice>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const source = useRef<string>('');
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    document.title = '备份与本地记录 · PaperDesk';
    let alive = true;
    const refresh = () => { personalStore.exportBackup().then(value => { if (alive) setSnapshot(value); }).catch(reason => { if (alive) setError(message(reason)); }); };
    refresh(); const unsubscribe = personalStore.subscribe(refresh);
    return () => { alive = false; unsubscribe(); };
  }, []);

  async function exportFile() {
    setBusy(true); setError(''); setNotice('');
    try {
      const backup = await personalStore.exportBackup();
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `paperdesk-backup-${backup.exportedAt.slice(0, 10)}.json`;
      anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('已生成备份下载。请在浏览器下载列表确认文件已保存。');
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  async function makePreview(text: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const value = await personalStore.previewImport(text, available);
      source.current = text; setPreview(value); setChoices({});
    } catch (reason) { setPreview(undefined); setError(message(reason)); }
    finally { setBusy(false); }
  }
  async function selectFile(file?: File) {
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) { setPreview(undefined); setError('备份超过 5 MiB 限制，尚未导入。'); return; }
    try { await makePreview(await file.text()); }
    catch (reason) { setError(message(reason)); }
  }
  async function applyImport() {
    if (!preview) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await personalStore.importBackup(preview, choices);
      setSnapshot(await personalStore.exportBackup()); setPreview(undefined); source.current = '';
      setNotice(`已导入 ${result.imported} 条，其中保留副本 ${result.copied} 条，跳过 ${result.skipped} 条。`);
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  async function removeAll() {
    if (!confirmRemoval) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await personalStore.clearAll(); setSnapshot(await personalStore.exportBackup());
      setPreview(undefined); source.current = ''; setRemoveOpen(false); setConfirmRemoval(false);
      setNotice('已清除当前浏览器的个人记录和阅读设置。');
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  return <main id="main-content" className="records-page">
    <header className="records-heading"><span className="eyebrow">数据管理 · 此浏览器</span><h1>备份与本地记录</h1>
    <p className="records-intro">备份当前浏览器的笔记、探索、阅读位置、主动标记和阅读设置。文件可能包含私人文字，请妥善保管。</p>
    </header>
    {error && <p role="alert" className="records-error">{error}</p>}
    <p role="status" className="records-status">{notice}</p>
    <section className="records-section" aria-labelledby="current-records-title">
      <h2 id="current-records-title">当前记录</h2>
      {snapshot ? <dl className="records-counts">{names.map(name => <div key={name}><dt>{labels[name]}</dt><dd>{snapshot[name].length}</dd></div>)}</dl> : <p role="status">正在读取本地记录…</p>}
      <div className="form-actions"><button className="primary-action" disabled={busy} onClick={() => void exportFile()}>导出完整备份</button><button className="secondary-action" disabled={busy} onClick={() => fileInput.current?.click()}>选择备份并预览</button></div>
      <input className="records-file-input" ref={fileInput} type="file" accept=".json,application/json" aria-label="选择个人记录备份" onChange={event => { void selectFile(event.target.files?.[0]); event.target.value = ''; }} />
      <p className="records-muted">接受 PaperDesk 个人备份 v1，最大 5 MiB。仅选择文件不会修改记录。</p>
    </section>
    <aside className="records-scope" aria-label="备份范围与迁移"><div><h2>保留一份可迁移的记录</h2><p className="records-muted">浏览器清理或回收存储可能删除记录；更换浏览器或访问地址时，请用备份迁移。目前没有同步服务，也不保证离线可用。</p></div><div><h2>AI 对话单独保存</h2><p className="records-muted">AI 对话需在阅读页的 AI 解读中单独备份、恢复或删除，不受本页操作影响。连接同一本机服务的浏览器共享 AI 对话。</p></div></aside>
    {preview && <section className="records-section records-preview" aria-labelledby="import-preview-title">
      <h2 id="import-preview-title">导入预览</h2>
      <p>导出时间：{preview.backup.exportedAt}。以下是文件内的准确数量；完全相同的记录会跳过。</p>
      <dl className="records-counts">{names.map(name => <div key={name}><dt>{labels[name]}</dt><dd>{preview.counts[name]}</dd></div>)}</dl>
      <p>完全重复 {preview.duplicates} 条；需要选择 {preview.conflicts.length} 项；不可用的导读位置 {preview.unavailable.length} 处；缺失的关联笔记 {preview.missingNotes.length} 条。</p>
      {(preview.unavailable.length > 0 || preview.missingNotes.length > 0) && <div className="records-warning"><p>这些链接当前不可用，原有引文、来源和标识仍会保留。</p><ul>{preview.unavailable.map(item => <li key={item}>导读位置：{item}</li>)}{preview.missingNotes.map(item => <li key={item}>关联笔记：{item}</li>)}</ul></div>}
      {preview.conflicts.map((conflict, index) => <fieldset className="records-conflict" key={conflict.key}>
        <legend>冲突 {index + 1} · {conflict.store === 'preferences' ? '阅读设置' : labels[conflict.store]}</legend>
        <label className="field-label">处理方式<select value={choices[conflict.key] ?? (conflict.canKeepBoth ? 'keep-both' : 'keep-local')} onChange={event => setChoices(current => ({ ...current, [conflict.key]: event.target.value as ImportChoice }))}>
          {conflict.canKeepBoth && <option value="keep-both">保留两份（导入项另存副本）</option>}
          <option value="keep-local">保留本地，跳过导入项</option><option value="use-imported">使用导入项，替换本地项</option>
        </select></label>
        <div className="records-comparison"><details><summary>查看本地完整记录</summary><pre>{JSON.stringify(conflict.local, null, 2)}</pre></details><details><summary>查看导入完整记录</summary><pre>{JSON.stringify(conflict.incoming, null, 2)}</pre></details></div>
      </fieldset>)}
      <details className="records-exact-preview"><summary>查看将导入文件的完整内容</summary><textarea aria-label="导入文件完整内容" readOnly value={JSON.stringify(preview.backup, null, 2)} /></details>
      <p className="records-muted">笔记和探索的冲突默认保留两份；阅读位置、阅读标记和设置默认保留本地。</p>
      <div className="form-actions"><button className="primary-action" disabled={busy} onClick={() => void applyImport()}>确认按以上选择导入</button><button className="secondary-action" disabled={busy} onClick={() => { setPreview(undefined); source.current = ''; setChoices({}); setError(''); setNotice('已取消，本地记录未改变。'); }}>取消导入</button><button className="secondary-action" disabled={busy} onClick={() => void makePreview(source.current)}>重新预览</button></div>
    </section>}
    <section className="records-section records-removal" aria-labelledby="remove-records-title"><div><h2 id="remove-records-title">清除本地记录</h2><p>清除当前来源的笔记、探索、位置、主动标记和阅读设置。导读正文不受影响。</p></div><button className="records-danger secondary-action" disabled={busy} onClick={() => { setRemoveOpen(true); setConfirmRemoval(false); }}>清除前确认</button></section>
    {removeOpen && <Dialog title="确认清除本地记录" onClose={() => { if (!busy) setRemoveOpen(false); }}>
      <p>这会删除当前浏览器来源的全部个人记录。此操作无法撤销；已有备份可重新导入。</p>
      <button className="secondary-action" disabled={busy} onClick={() => void exportFile()}>先导出完整备份</button>
      {error && <p role="alert" className="records-error">{error}</p>}{notice && <p role="status">{notice}</p>}
      <label className="records-confirm"><input type="checkbox" checked={confirmRemoval} onChange={event => setConfirmRemoval(event.target.checked)} />我确认清除全部个人记录和阅读设置</label>
      <div className="form-actions"><button className="records-danger secondary-action" disabled={busy || !confirmRemoval} onClick={() => void removeAll()}>确认清除全部记录</button><button className="secondary-action" disabled={busy} onClick={() => setRemoveOpen(false)}>取消</button></div>
    </Dialog>}
  </main>;
}
