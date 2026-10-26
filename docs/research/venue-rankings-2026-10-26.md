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

ACM Computing Surveys (ISSN 0360-0300) displays **中科院 1区 · 2025大类**, for the computer-science major category. The [SCI365 journal record](https://www.sci365.cn/journals/acm-computing-surveys-03600300/) explicitly identifies the 2025 upgraded table and zone 1. The [Wuhan University Library record](https://topj.lib.whu.edu.cn/show.asp?cat=sci&id=4714) independently lists computer-science major category 1 and theory/methods minor category 1.

This is a secondary-database edition record cross-checked against a university library record, **not direct verification of the official CAS table**. The university page does not state its edition, so it does not independently establish the 2025 date. That distinction is retained in the label's source description. The original `fenqubiao.com` service was not accessible during this check. JCR Q1 and the separate 2026 New Ranking system are not substituted for CAS zones.

## Blank entries and maintenance

No verified CCF or CAS label was established for TMLR in this check. It stays blank; this is not a claim that the journal is absent from every classification. The Agent memory survey's stored publication is arXiv, so no journal/conference rating is assigned. Other international quartile systems may be added only with clear edition, category and evidence; none is needed for this release.

`src/library/venueRankings.ts` owns the small reviewed registry and selection policy. Match the actual publication kind and exact reviewed venue name, including known historical aliases. Unknown spelling or a newly imported venue record remains blank until checked; workshops and similarly named journals do not inherit a main venue's grade. Updating the labels must include a new source check and edition, without rewriting immutable guide metadata or personal records. The website performs no background ranking lookup or tracking request; source links open only when selected.

Build and 29 affected browser checks passed after adding the labels, including known references, blank entries, synthetic mismatched names, preprint exclusion, narrow layout and the existing guide/navigation checks. Production screenshots use public text and an isolated browser with external/API requests blocked; no real service or personal records are involved.
