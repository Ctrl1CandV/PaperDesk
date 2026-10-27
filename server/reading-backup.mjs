import { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync, renameSync, realpathSync, statSync } from 'node:fs';
import { resolve, join, dirname, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { digest } from './retrieval-index.mjs';
import { ReadingMaterials, MATERIAL_LIMIT } from './reading-materials.mjs';
import { object, isHash, reject } from './validation.mjs';

const allowed = /^(?:materials\/[a-f0-9]{64}\.(?:html|pdf)|derived\/[a-f0-9]{64}\.json|(?:manifests|evidence)\/[a-z0-9][a-z0-9-]{0,99}\.json)$/;
function checkedFile(root, name) {
  if (!allowed.test(name)) reject('原文备份文件路径无效。');
  const base = realpathSync(root), file = realpathSync(join(base,name)), rel = relative(base,file), stat = statSync(file);
  if (rel.startsWith('..') || isAbsolute(rel) || !stat.isFile() || stat.size > MATERIAL_LIMIT) reject('原文备份文件超出边界。');
  return file;
}
function verifyAuthority(directory) {
  const reading = new ReadingMaterials(directory);
  for (const manifest of reading.list()) {
    const raw = readFileSync(checkedFile(directory, `materials/${manifest.materialFile}`));
    if (digest(raw) !== manifest.materialSha256) reject('原文材料哈希不符；备份或恢复未完成。');
    reading.derived(manifest);
  }
  for (const evidence of reading.evidence()) {
    for (const unit of evidence.sourceUnitIds) reading.view(evidence.sourceRevisionId,evidence.parserRevision,unit);
  }
}
/** An explicit offline operation. A new destination is committed with one rename. */
export async function backupReading(directory, destination, signal) {
  if (existsSync(destination)) reject('原文备份目标已存在，请使用新的目录。');
  verifyAuthority(directory); const files=[];
  for (const folder of ['materials','manifests','derived','evidence']) {
    if (!existsSync(join(directory,folder))) continue;
    for (const name of readdirSync(join(directory,folder)).sort()) if (allowed.test(`${folder}/${name}`)) files.push(`${folder}/${name}`);
  }
  if (files.length > 10000) reject('原文备份超过 10000 文件上限。');
  const stage = `${resolve(destination)}.staging-${randomUUID()}`; mkdirSync(stage,{recursive:true}); const entries=[];
  for (const name of files) {
    signal?.throwIfAborted(); const bytes=readFileSync(checkedFile(directory,name)), path=join(stage,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes,{flag:'wx',mode:0o600});
    entries.push({path:name,bytes:bytes.length,sha256:digest(bytes)}); await new Promise(done=>setImmediate(done));
  }
  verifyAuthority(stage);
  const manifest={format:'paperdesk-reading-backup',schemaVersion:1,createdAt:new Date().toISOString(),files:entries};
  writeFileSync(join(stage,'backup-manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',flush:true});signal?.throwIfAborted();renameSync(stage,destination);
  return {files:entries.length,bytes:entries.reduce((n,f)=>n+f.bytes,0)};
}
export async function restoreReading(source,destination,signal) {
  if (existsSync(destination)) reject('恢复目标必须为空且尚不存在；先保留当前材料目录，不覆盖已有原文。');
  const manifestFile=join(source,'backup-manifest.json');if(statSync(manifestFile).size>2*1024*1024)reject('原文备份清单过大。');
  const manifest=JSON.parse(readFileSync(manifestFile,'utf8'));object(manifest,['format','schemaVersion','createdAt','files']);
  if(manifest.format!=='paperdesk-reading-backup'||manifest.schemaVersion!==1||!Array.isArray(manifest.files)||manifest.files.length>10000)reject('原文备份格式无效。');
  const stage=`${resolve(destination)}.staging-${randomUUID()}`;mkdirSync(stage,{recursive:true});const names=new Set();
  for(const entry of manifest.files){
    signal?.throwIfAborted();object(entry,['path','bytes','sha256']);if(!allowed.test(entry.path)||names.has(entry.path)||!isHash(entry.sha256)||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||entry.bytes>MATERIAL_LIMIT)reject('原文备份清单条目无效。');names.add(entry.path);
    const bytes=readFileSync(checkedFile(source,entry.path));if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)reject('原文备份文件缺失或校验和不符；未切换材料目录。');
    const path=join(stage,entry.path);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes,{flag:'wx',mode:0o600});await new Promise(done=>setImmediate(done));
  }
  verifyAuthority(stage);signal?.throwIfAborted();renameSync(stage,destination);return {files:names.size};
}
