import { importContent, recoverContent, rollbackContent } from './content-import.mjs';

const usage = 'Usage: npm run import:content -- --from incoming/package --dry-run|--apply; or --recover [--apply]; or --rollback [--apply]';
try {
  const args = process.argv.slice(2);
  let from;
  const flags = new Set();
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--from' && from === undefined && args[index + 1] && !args[index + 1].startsWith('--')) from = args[++index];
    else if (['--dry-run', '--apply', '--recover', '--rollback'].includes(argument) && !flags.has(argument)) flags.add(argument);
    else throw new Error(usage);
  }
  if (flags.has('--apply') && flags.has('--dry-run') || flags.has('--recover') && flags.has('--rollback')) throw new Error(usage);
  let result;
  if (flags.has('--recover') || flags.has('--rollback')) {
    if (from || flags.has('--dry-run')) throw new Error(usage);
    result = await (flags.has('--recover') ? recoverContent : rollbackContent)({ apply: flags.has('--apply') });
  } else {
    if (!from || !flags.has('--apply') && !flags.has('--dry-run')) throw new Error(usage);
    result = await importContent({ from, apply: flags.has('--apply') });
  }
  console.log(JSON.stringify(result, null, 2));
  console.log('Content only. Personal notes, states, evidence and backups are never read or changed by this command.');
} catch (error) {
  // Node filesystem errors can contain machine paths. Only neutral code plus controlled validation messages are printed.
  console.error(error.code ? `Content update failed (${error.code}). Active content was not intentionally replaced; inspect --recover.` : String(error.message).replace(/[A-Za-z]:[\\/][^\r\n]*/gu, '[local path omitted]'));
  process.exitCode = 1;
}
