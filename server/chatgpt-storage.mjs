import { mkdir, readFile, writeFile, rename, unlink, lstat, chmod } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { PublicError } from './validation.mjs';

const STORAGE_ERROR = 'ChatGPT 登录凭据无法安全保存或读取。请检查本机凭据目录权限后重试。';
// Only this fixed script is executed. Paths and secret bytes travel over stdin,
// never through command arguments, shell interpolation, logs or temporary scripts.
const DPAPI_SCRIPT = `$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Security
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  if ($request.operation -eq 'secure-directory') {
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    [System.IO.Directory]::SetAccessControl($request.path, $acl)
    [Console]::Out.Write('ok')
  } else {
    $bytes = [Convert]::FromBase64String($request.data)
    $entropy = [Text.Encoding]::UTF8.GetBytes('PaperDesk.ChatGPT.credentials.v1')
    if ($request.operation -eq 'protect') {
      $result = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    } elseif ($request.operation -eq 'unprotect') {
      $result = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $entropy, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    } else { throw 'invalid-operation' }
    [Console]::Out.Write([Convert]::ToBase64String($result))
  }
} catch { [Environment]::Exit(1) }`;

function windowsProtection(request) {
  return new Promise((resolveResult, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', DPAPI_SCRIPT], { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'ignore'] });
    let output = '', settled = false;
    const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(new PublicError(STORAGE_ERROR, 503)) : resolveResult(result); };
    const timer = setTimeout(() => { child.kill(); finish(true); }, 10000);
    child.on('error', () => finish(true));
    child.stdin.on('error', () => finish(true));
    child.stdout.on('data', data => { output += data.toString('utf8'); if (output.length > 1024 * 1024) { child.kill(); finish(true); } });
    child.once('close', code => finish(code !== 0, output));
    child.stdin.end(JSON.stringify(request));
  });
}

export class ChatGptStorage {
  constructor(directory, { platform = process.platform, protectImpl = windowsProtection } = {}) {
    this.directory = resolve(directory); this.platform = platform; this.protectImpl = protectImpl;
    this.file = join(this.directory, platform === 'win32' ? 'credentials.dpapi.json' : 'credentials.json');
  }
  async initialize() {
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      if ((await lstat(this.directory)).isSymbolicLink()) throw Error();
      if (this.platform === 'win32') await this.protectImpl({ operation: 'secure-directory', path: this.directory });
      else await chmod(this.directory, 0o700);
    } catch { throw new PublicError(STORAGE_ERROR, 503); }
  }
  async read() {
    try {
      let stat;
      try { stat = await lstat(this.file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw Error();
      if (this.platform !== 'win32' && (stat.mode & 0o077)) throw Error();
      const raw = await readFile(this.file, 'utf8');
      if (this.platform !== 'win32') return JSON.parse(raw);
      const envelope = JSON.parse(raw);
      if (envelope.format !== 'paperdesk-chatgpt-dpapi' || envelope.schemaVersion !== 1 || typeof envelope.data !== 'string') throw Error();
      const encoded = await this.protectImpl({ operation: 'unprotect', data: envelope.data });
      return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    } catch { throw new PublicError(STORAGE_ERROR, 503); }
  }
  async write(value) {
    const temporary = join(this.directory, `credentials-${randomUUID()}.tmp`);
    try {
      let raw = JSON.stringify(value);
      if (Buffer.byteLength(raw) > 256 * 1024) throw Error();
      if (this.platform === 'win32') {
        const data = await this.protectImpl({ operation: 'protect', data: Buffer.from(raw).toString('base64') });
        raw = JSON.stringify({ format: 'paperdesk-chatgpt-dpapi', schemaVersion: 1, data });
      }
      await writeFile(temporary, raw, { flag: 'wx', mode: 0o600, flush: true });
      await rename(temporary, this.file);
    } catch { throw new PublicError(STORAGE_ERROR, 503); }
    finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') { /* No private data is logged. */ } }); }
  }
}
