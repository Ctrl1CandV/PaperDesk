# Publication venue reference labels

The library presents one compact, sourced venue label: prefer a verified CCF A/B recommendation; otherwise use a verified CAS major-category zone 1/2. Unsupported or unknown venues remain blank. No label is inferred from a paper's subject, citations or title, and a preprint does not inherit a conference's classification. These are reference editions for venues, not paper scores or a determination of eligibility under an institution's rules.

## CCF: seventh edition, 2026

The [CCF announcement](https://www.ccf.org.cn/Academic_Evaluation/By_category/2026-03-05/861526.shtml) identifies the seventh edition. The original directory was read through a [public copy of the 72-page PDF](https://scdm-shu.github.io/ccf/2026-CCF-Ranking.pdf), with a matching [university notice and formal-version attachment](https://ai.ucas.ac.cn/index.php/zh-cn/jxjy/fzpy1/7675-ccf-2026). The CCF announcement was search-readable; direct automated access returned HTTP 405. No authentication was bypassed.

| Venue | Label | Directory location |
|---|---|---|
| NeurIPS, including historical NIPS name | CCF-A · 2026目录 | Artificial intelligence, A conferences; PDF page 57 |
| ICLR | CCF-A · 2026目录 | Artificial intelligence, A conferences; PDF page 57 |
| Frontiers of Computer Science | CCF-B · 2026目录 | Interdisciplinary/comprehensive/emerging, B journals; PDF page 68 |

The date labels prevent current directory references from being confused with a paper's publication year. In particular, an earlier ICLR publication is displayed against the 2026 directory, not assigned a fabricated historical grade. FCS uses CCF-B even though public CAS data also places it in zone 2; the UI does not repeat both systems merely to fill space.

## CAS: ACM Computing Surveys

ACM Computing Surveys (ISSN 0360-0300) displays **CAS-1 · 2025大类**, for the computer-science major category. CAS is the [Chinese Academy of Sciences](https://english.cas.cn/) abbreviation; `CAS-1` is this interface's compact notation for 中科院 1区, not a claim of a standardized official zone code. The full Chinese meaning, category and source limitations remain in the tooltip and accessible name. The badge follows the author/publication text inline, wrapping naturally when space is limited. The [SCI365 journal record](https://www.sci365.cn/journals/acm-computing-surveys-03600300/) explicitly identifies the 2025 upgraded table and zone 1. The [Wuhan University Library record](https://topj.lib.whu.edu.cn/show.asp?cat=sci&id=4714) independently lists computer-science major category 1 and theory/methods minor category 1.

This is a secondary-database edition record cross-checked against a university library record, **not direct verification of the official CAS table**. The university page does not state its edition, so it does not independently establish the 2025 date. That distinction is retained in the label's source description. The original `fenqubiao.com` service was not accessible during this check. JCR Q1 and the separate 2026 New Ranking system are not substituted for CAS zones.

## Formal publications checked 2026-11-20

Some guides recorded a preprint or a short venue string. Their formal publications were checked on 2026-11-20 and are kept in `formalPublications` in `src/library/venueRankings.ts`; the immutable guide metadata is unchanged, and the brief says which version the guide teaches from.

| Guide | Formal publication | Source | Label |
|---|---|---|---|
| multi-agent-communication-survey | Frontiers of Computer Science 21(7), article 2107352; published online 2026-05-29 | [journal page](https://journal.hep.com.cn/fcs/EN/10.1007/s11704-026-50857-y) | CCF-B (same journal as above) |
| agentprune | ICLR 2025 | [ICLR proceedings](https://proceedings.iclr.cc/paper_files/paper/2025/hash/bbc461518c59a2a8d64e70e2c38c4a0e-Abstract-Conference.html) | CCF-A |
| tau-bench | ICLR 2025 | [ICLR proceedings PDF](https://proceedings.iclr.cc/paper_files/paper/2025/file/1b126cc38b8638e07bef37e7b2bb72bf-Paper-Conference.pdf) | CCF-A |
| autogen | Conference on Language Modeling (COLM) 2024 | [Microsoft Research publication page](https://www.microsoft.com/en-us/research/publication/autogen-enabling-next-gen-llm-applications-via-multi-agent-conversation-framework/) | none: COLM is not in the CCF 2026 directory |
| llm-evaluation-survey | ACM Transactions on Intelligent Systems and Technology 15(3), article 39, 2024 | [DOI 10.1145/3641289](https://doi.org/10.1145/3641289) | none: TIST is a CCF class C journal (database, data mining and content retrieval; PDF page 34), below the A/B threshold |

The communication survey's journal page also carries a "change history" block whose retraction and correction dates are empty; no retraction notice for this article was found. Recheck the page before citing the journal version. CAMEL (NeurIPS 2023 main track, [proceedings](https://proceedings.neurips.cc/paper/2023/hash/a3621ee907def47c1b952ade25c67698-Abstract-Conference.html)) and AgentBench (ICLR 2024) already recorded their venues; their spellings are now exact aliases, so both show CCF-A. No formal publication was found for the RAG survey (arXiv 2312.10997) or the multi-agent collaboration survey (arXiv 2501.06322; a university repository lists it as peer-reviewed but names no venue and could not be read), so both show "arXiv 预印本". TMLR and Findings of ACL do not appear in the CCF 2026 directory and are written out without a label.

## Blank entries and maintenance

No verified CCF or CAS label was established for TMLR in this check. It stays blank; this is not a claim that the journal is absent from every classification. The Agent memory survey's stored publication is arXiv, so no journal/conference rating is assigned. Other international quartile systems may be added only with clear edition, category and evidence; none is needed for this release.

`src/library/venueRankings.ts` owns the small reviewed registry and selection policy. Match the actual publication kind and exact reviewed venue name, including known historical aliases. Unknown spelling or a newly imported venue record remains blank until checked; workshops and similarly named journals do not inherit a main venue's grade. Updating the labels must include a new source check and edition, without rewriting immutable guide metadata or personal records. The website performs no background ranking lookup or tracking request; source links open only when selected.

Build and 29 affected browser checks passed after adding the labels, including known references, blank entries, synthetic mismatched names, preprint exclusion, narrow layout and the existing guide/navigation checks. Production screenshots use public text and an isolated browser with external/API requests blocked; no real service or personal records are involved.
