// Commands typed in the single AI conversation, and the reading file they can
// produce. Shared by the backend (per-turn requirements) and the browser
// (command parsing, section check, export header). Data only.

export const BRIEF_PURPOSES = Object.freeze({
  accumulation: { label: '积累', description: '想弄清一个主题：优先综述与经典论文，说明前置知识和阅读顺序。' },
  research: { label: '推进', description: '服务当前研究方向的一个子问题：偏机制、方法比较、评测与反例，条件更严格。' },
});
export const STAGE_LABELS = Object.freeze({
  broaden: { label: '拓宽了解', doing: '读综述和代表论文，弄清这个领域由哪些部分组成、彼此怎样联系。', done: '能说出这个问题落在领域的哪一部分，以及还不熟悉的关键概念。' },
  narrow: { label: '收窄方向', doing: '比较几个候选方向的依据、疑点和可行性，记下取舍理由。', done: '能说出一两个候选方向，以及为什么倾向其中一个。' },
  question: { label: '形成研究问题', doing: '把倾向的方向写成可以检验的问题和子问题，找最接近的已有工作。', done: '能写出核心问题、子问题和最接近的已有工作。' },
  validate: { label: '准备验证', doing: '设计最小的验证：基线、数据、指标、对照和停止条件。', done: '有一份可以执行的验证计划，以及什么结果会改变判断。' },
  write: { label: '准备写作', doing: '整理论证主线、证据和相关工作，准备成文。', done: '有清楚的论证结构，证据和引用可以回查。' },
});

export const READING_BRIEF = Object.freeze({
  label: '选文实施文件',
  fileName: '选文实施文件.md',
  sections: [
    { title: '本轮目的', keywords: ['本轮目的', '目的', '阅读问题'], hint: { accumulation: '想弄清什么；为什么现在需要；与已读内容的关系。', research: '服务哪个研究方向的哪个子问题；为什么现在需要；与当前主线的关系。' } },
    { title: '已有基础与缺口', keywords: ['已有基础', '缺口', '覆盖'], hint: { accumulation: '本库已有哪些导读、读者已读哪些；还缺什么理解；哪些不必重复找。', research: '本库已有哪些导读、读者已读哪些、讨论已形成哪些认识；还缺什么证据；哪些不必重复找。' } },
    { title: '需要的材料类型', keywords: ['材料类型', '文献类型'], hint: { accumulation: '优先综述、教程性强的经典论文或代表性系统论文，各自用来理解什么。', research: '机制论文、方法比较、评测、失败案例或反例中需要哪几类，各自用来回答什么。' } },
    { title: '关注范围与检索表达', keywords: ['检索', '关键词', '关注范围'], hint: { accumulation: '主题边界和关键概念；中英文关键词与同义表达，标明哪些只是推测的检索起点。', research: '具体机制、条件和范围；中英文关键词与同义表达，标明哪些只是推测的检索起点。' } },
    { title: '纳入与排除条件', keywords: ['纳入', '排除', '筛选条件'], hint: { accumulation: '入门可读性、覆盖面、年份或权威性等条件及理由，优先级清楚。', research: '与子问题的相关性、证据强度、可比性、年份等条件及理由，优先级清楚；不要只给宽泛领域名。' } },
    { title: '已知线索与比较对象', keywords: ['线索', '比较对象', '反例'], hint: { accumulation: '已知论文或来源的可核对身份与版本；没有核实的写“未核实”，不要编造候选。', research: '已知论文或来源的可核对身份与版本、可能的比较对象或反例；没有核实的写“未核实”。' } },
    { title: '期望返回', keywords: ['期望返回', '返回成果', '交付'], hint: { accumulation: '候选清单及取舍理由、建议阅读顺序和前置知识、来源与缺口；读者授权时可准备入库导读。', research: '候选清单及取舍理由、与子问题的对应关系、建议阅读顺序、来源与缺口；读者授权时可准备入库导读。' } },
    { title: '限制与授权', keywords: ['授权', '限制'], hint: { accumulation: '已明确的数量、时间、来源要求和行动权限；没讨论过的写“待确认”，不要补成授权。', research: '已明确的数量、时间、来源要求和行动权限；没讨论过的写“待确认”，不要补成授权。' } },
    { title: '完成与返回讨论的条件', keywords: ['完成', '结束', '返回讨论', '停止'], hint: { accumulation: '满足什么条件即可结束本轮选文；什么发现需要回到讨论。', research: '满足什么条件即可结束本轮选文；什么发现会改变方向判断、需要回到讨论。' } },
  ],
});

/** `/方向` and `/选文 [积累|推进]` at the start of a message. */
export function parseCommand(text) {
  const match = String(text).trimStart().match(/^\/(方向|direction|选文|brief)(?=$|\s)(?:\s+(积累|推进))?/u);
  if (!match) return null;
  const rest = String(text).trimStart().slice(match[0].length).trim();
  if (match[1] === '方向' || match[1] === 'direction') return { command: { name: 'direction' }, rest };
  return { command: { name: 'reading-brief', ...(match[2] ? { purpose: match[2] === '推进' ? 'research' : 'accumulation' } : {}) }, rest };
}
export function validCommand(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (value.name === 'direction') return keys.length === 1;
  return value.name === 'reading-brief' && keys.length === 2 && Object.hasOwn(BRIEF_PURPOSES, value.purpose);
}

const fileRules = `- 依据当前研究快照（如有）、本轮选入的资料、本主题讨论、本库目录和读者的阅读标记。信息不足时先用可用的历史工具回看讨论，不要凭空补全。
- 标注每条判断的性质：〔文献〕、〔读者〕、〔推断〕或〔假设〕。读者采纳的假设仍是假设。
- 不虚构论文、作者、年份、链接或检索结果；未经核实的候选只能作为检索线索，并标“未核实”。
- 读者没有讨论过的数量、时间、资源和行动权限写“待确认”，不要替读者补成授权。
- 用执行者无需此前对话也能理解的完整句子，条件和理由具体、可检查；全文以 1500–2500 字为宜，用条目写，不重复铺陈。`;

/** Requirements the backend appends before the reader's message when a command is used. */
export function commandInstruction(command, { linked }) {
  if (command.name === 'direction') return linked
    ? `应用附加的指令要求（不是读者原话）：读者输入了 /方向，要求根据最近的讨论更新当前研究方向。先对照研究快照判断哪些确实变了：问题是否需要改写，认识、候选与暂缓方向、尚不确定之处、阶段（stage：broaden 拓宽了解 / narrow 收窄方向 / question 形成研究问题 / validate 准备验证 / write 准备写作）、下一步，以及读者在讨论中明确表达的取舍。
- 有实质变化：调用一次 propose_research_changes，只包含变化的字段，字段值写完整的新内容；只有读者明确表态的选择才写成 adopted 或 rejected 决定，你的建议放进候选方向。读者已用指令授权，界面会直接写入并保留版本。
- 没有实质变化：不调用工具，说明为什么暂不更新、讨论还缺什么。
- 正文用几句话说明改了什么、依据是什么、接下来做什么；不要重复全部字段。不得编造读者兴趣、资源或授权。`
    : `应用附加的指令要求（不是读者原话）：读者输入了 /方向，要求根据目前的讨论建立一个研究方向。先判断讨论是否已经能说清：一个值得持续调查的问题、它为什么值得调查、目前的初步认识，以及至少一个可以调查的方向。
- 能说清：调用一次 create_research_direction。title 是简短的方向名；question 是核心问题；interpretation 写目前的认识及依据；candidates 列出候选方向及区别、依据和主要疑点；unknowns 写尚不确定之处；scope 与 constraints 只写读者确认过的内容，否则留空；stage 按实际选择（多数刚起步的方向是 broaden 或 narrow）；nextAction 给一个具体下一步；rationale 说明为什么现在可以建立这个方向。读者已用指令授权，界面会直接建立方向。
- 还说不清：不调用工具，直接说明还缺什么，最多提出两个最关键的问题。
- 正文用几句话说明建立了什么方向、依据和下一步；不要重复全部字段。区分文献、读者观点、推断和假设，不得编造读者兴趣、资源或授权。`;
  const purpose = command.purpose;
  return `应用附加的指令要求（不是读者原话）：读者输入了 /选文（目的：${BRIEF_PURPOSES[purpose].label}）。${BRIEF_PURPOSES[purpose].description}要求生成一份交给外部执行者（Harness，具备检索、审阅和内容制作能力，但没看过此前讨论）的选文实施文件。
先判断信息是否足以形成可执行的文件：至少要知道想弄清什么、范围大致在哪里${purpose === 'research' ? '，以及它服务当前方向的哪个子问题' : ''}。
- 不足：不要输出文件，回答不要以 # 开头；说明缺少什么，最多提出两个最关键的问题。
- 足够：回答本身就是文件。第一行写“# ${READING_BRIEF.label}：<简短主题>”，然后依次使用以下二级标题，可以增加小节但不要省略；读者已用指令授权，界面会直接保存这份文件。
${READING_BRIEF.sections.map((section, index) => `## ${index + 1}. ${section.title} —— ${section.hint[purpose]}`).join('\n')}
要求：
${fileRules}
- 只输出文件正文，不在前后加寒暄或额外说明。`;
}

/** The answer counts as a generated file only when it opens with the file heading. */
export function readingBriefTitle(markdown) {
  const match = String(markdown).match(/^\s*#[ \t]+选文实施文件[：:][ \t]*(.+?)[ \t]*#*[ \t]*$/m);
  return match && String(markdown).trimStart().startsWith('#') ? match[1].trim().slice(0, 200) : null;
}

/** Lenient heading check: a section counts as present when a heading names it. */
export function checkDocumentSections(markdown) {
  const headings = String(markdown).split(/\r?\n/).filter(line => /^ {0,3}#{2,4}[ \t]/.test(line)).map(line => line.replace(/^ {0,3}#+[ \t]*/, ''));
  const present = [], missing = [];
  for (const section of READING_BRIEF.sections) (headings.some(heading => [section.title, ...section.keywords].some(word => heading.includes(word))) ? present : missing).push(section.title);
  return { present, missing };
}

/** Header for a downloaded file, telling a new executor how to read it. */
export function documentPreamble({ purpose, savedAt, containerTitle, workflows = [] }) {
  const date = savedAt.slice(0, 10);
  const why = purpose === 'research' ? `推进研究方向“${containerTitle}”` : `积累对“${containerTitle}”的理解`;
  return `> **文件用途**：选文实施文件（${BRIEF_PURPOSES[purpose]?.label ?? '未标注目的'}）——为${why}寻找并核验下一轮综述和论文。来自 PaperDesk 的讨论，读者于 ${date} 保存。
>
> **执行者请先读完全文**：按“纳入与排除条件”检索和核验候选，按“期望返回”提交成果。“限制与授权”中未明确允许的行动一律视为待确认，不要自行扩大范围。出现“完成与返回讨论的条件”所列情况时，停止并带着发现返回讨论。
>
> 文中〔文献〕〔读者〕〔推断〕〔假设〕标明各条判断的性质；读者采纳只表示工作选择，不表示已经证实。${workflows.length ? `如获授权把候选制作为 PaperDesk 导读，遵循仓库内 ${workflows.map(item => `\`${item.path}\``).join('、')}；个人研究记录和讨论不得写入公开内容。` : ''}`;
}
