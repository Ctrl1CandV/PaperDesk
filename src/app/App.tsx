import { useEffect, useState } from 'react';
import { contentRepository } from '../content/repository';
import { AppLink, useLocation } from './navigation';
import { Reader } from '../reader/Reader';
import { Markdown } from '../reader/Markdown';
import { Library } from '../library/Library';
import { NotesPage } from '../notes/Notes';
import { BackupPage } from '../records/BackupPage';
import { ExplorePage, LensPage, ExplorationPage } from '../exploration';
import { PacketDialog } from '../handoff/PacketDialog';
import type { Exploration } from '../records/types';
import type { Guide } from '../content/types';

function Header({ pathname }: { pathname: string }) {
  const library = pathname === '/' || pathname === '/library' || pathname.startsWith('/read/');
  return <header className="site-header"><div className="header-inner">
    <AppLink to="/" className="brand"><span className="brand-mark" aria-hidden="true">p<span>.</span></span>PaperDesk</AppLink>
    <nav className="header-navigation" aria-label="主导航"><AppLink to="/library" current={library}>书架</AppLink><AppLink to="/explore" current={pathname.startsWith('/explore')}>探索</AppLink><AppLink to="/notes" current={pathname === '/notes'}>笔记</AppLink><AppLink to="/backup" current={pathname === '/backup'}>备份</AppLink></nav>
  </div></header>;
}
function Missing({ id }: { id?: string }) {
  const revision = id && contentRepository.currentRevision(id);
  return <main id="main-content" className="error-page"><span className="eyebrow">内容暂不可用</span><h1>没有找到这个阅读版本</h1><p>该地址对应的内容未包含在当前内容包中。原地址保留，不会自动替换成其他版本。</p>{revision ? <AppLink className="primary-action" to={`/read/${id}/${revision}`}>查看当前推荐版本（修订 {revision}）</AppLink> : <AppLink className="primary-action" to="/library">返回阅读书架</AppLink>}</main>;
}
const fixture = '# 合成技术测试材料\n\n此页仅用于渲染测试，不是研究导读。\n\n| 合成字段 | 合成长值 |\n|---|---|\n| 字段 | ' + 'synthetic-column-'.repeat(30) + ' |\n\n$$\n' + Array.from({ length: 24 }, (_, i) => `x_{${i}}`).join(' + ') + '\n$$\n\n$$\n\\notACommand{x}\n$$\n\n<script>window.syntheticExecuted=true</script>\n\n[不安全链接](javascript:alert(1))\n\n![合成远程图](https://example.invalid/image.png)\n\n```mermaid\nflowchart LR\nA[合成] --> B[测试]\nclick A "https://example.invalid"\n```';
function GuidePage({ id, revision, synthetic = false }: { id: string; revision: number; synthetic?: boolean }) {
  const [state, setState] = useState<{ guide?: Guide; loading: boolean; error?: string }>({ loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true });
    void contentRepository.get(id, revision, { signal: controller.signal }).then(guide => {
      if (!controller.signal.aborted) setState({ guide, loading: false });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ loading: false, error: error instanceof Error ? error.message : '暂时无法读取内容。' });
    });
    return () => controller.abort();
  }, [id, revision, attempt]);
  if (state.loading) return <main id="main-content" className="error-page" data-navigation-pending="true"><p role="status">正在读取这篇导读…</p></main>;
  if (state.error) return <main id="main-content" className="error-page"><h1>暂时无法读取这篇导读</h1><p role="alert">{state.error}</p><button className="primary-action" onClick={() => setAttempt(value => value + 1)}>重试读取</button> <AppLink to="/library">返回书架</AppLink></main>;
  if (!state.guide) return <Missing id={id} />;
  return synthetic ? <main id="main-content" className="fixture prose"><Markdown guide={state.guide} unitId="synthetic" markdown={fixture} onCitation={() => {}} /></main> : <Reader guide={state.guide} />;
}
export function App() {
  const location = useLocation();
  const pathname = location.split(/[?#]/)[0];
  const [packet, setPacket] = useState<Exploration>();
  const match = /^\/read\/([a-z0-9-]+)\/(\d+)$/.exec(pathname);
  const lens = /^\/explore\/lenses\/([a-z0-9-]+)$/.exec(pathname);
  const question = /^\/explore\/questions\/([a-z0-9-]+)$/.exec(pathname);
  let page;
  if (match) page = <GuidePage key={`${match[1]}/${match[2]}`} id={match[1]} revision={Number(match[2])} />;
  else if (pathname === '/' || pathname === '/library') page = <Library key={pathname} home={pathname === '/'} />;
  else if (pathname === '/notes') page = <NotesPage />;
  else if (pathname === '/backup') page = <BackupPage />;
  else if (pathname === '/explore') page = <ExplorePage />;
  else if (lens) page = <LensPage key={lens[1]} lensId={lens[1]} />;
  else if (question) page = <ExplorationPage key={question[1]} explorationId={question[1]} onHandoff={setPacket} />;
  else if (import.meta.env.DEV && pathname === '/__fixtures/reader') page = <GuidePage key="fixture" id="agent-survey" revision={1} synthetic />;
  else page = <Missing id={match?.[1]} />;
  return <><a href="#main-content" className="skip-link">跳至正文</a><Header pathname={pathname} />{page}{packet && <PacketDialog exploration={packet} onClose={() => setPacket(undefined)} />}</>;
}
