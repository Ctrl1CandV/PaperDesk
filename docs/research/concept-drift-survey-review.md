# Concept drift survey: source and authoring review

Review date: 2026-10-24. The package supplies a new mainline guide; it does not create or infer personal reading state.

## Selection and identity

The learning purpose is nonstationary prediction and evaluation of adaptation. This fills the public reading route's concept-drift module and connects memory retention with the conditions under which older predictive evidence becomes obsolete. Its value is the relationship among detection, adaptation, feedback and evaluation, rather than a current leaderboard. A new broad LLM/Agent survey would overlap the existing library more strongly; a narrowly focused detector paper would not establish the same conceptual map first.

Formal publication: João Gama, Indrė Žliobaitė, Albert Bifet, Mykola Pechenizkiy and Abdelhamid Bouchachia, *A Survey on Concept Drift Adaptation*, ACM Computing Surveys 46(4), Article 44, 2014. The [publisher DOI record](https://doi.org/10.1145/2523813) identifies 37 published pages and the 2014 publication. The [Aalto institutional record](https://research.aalto.fi/en/publications/a-survey-on-concept-drift-adaptation/) independently agrees on year, venue, volume, issue and article identity.

The actual primary reading is the [author-hosted accepted manuscript](https://mpechen.win.tue.nl/publications/pubs/Gama_ACMCS_AdaptationCD_accepted.pdf), 44 physical pages including its online appendix. The first page and running footer retain January 2013 and a placeholder DOI; these are not used as formal bibliographic facts. The file URL identifies it as an accepted manuscript. It has not been established as byte-identical to the 37-page typeset article or its separately published supplement. All body locators use the downloaded manuscript's physical pages beginning at 1.

Downloaded source SHA-256: `3bb1c56b9eeae5878da926a6a7fd4e087a5fcd1da0af5bfb9c8b18b8282ddefa`. The hash fixes the reviewed bytes; the mutable public URL itself does not guarantee that a later download is identical. Source PDFs and rendered page images are temporary review inputs and are not distributed in the guide package.

## Reading and claim checks

Read §1–5, with selected Appendix A algorithm checks, Appendix B dataset descriptions, and Appendix C evaluation narrative. Bibliography entries and all cited studies were not independently reread. This is substantive mainline coverage, not a full-survey declaration.

| Claim area | Actual source locator | Review outcome |
|---|---|---|
| Joint distribution, conditional versus input shift | §2.1, pp3–5, Fig1 | Separate sample/state changes from distribution changes; input-only monitoring need not expose conditional shift. The guide adds a marked teaching qualification that changed conditional probabilities need not alter every optimal class decision. |
| Temporal types and outliers | §2.2, pp5–6, Fig2 | Distinguish incremental intermediate concepts from gradual old/new mixtures and recurring concepts; an isolated outlier does not establish drift. |
| Modular prediction/diagnosis/update and feedback | §2.4 and §3, pp6–7, 10–11, 25, Figs3–4 | Detector is optional for adaptation; labels can be delayed, unreliable, biased or costly. No model-generation concurrency mechanism is inferred. |
| Memory and forgetting | §3.1, pp10–14, Fig5, Table I | Short/long windows trade sensitivity and stability; recency is an assumption; gradual forgetting can use sufficient statistics without storing every raw example. |
| Detectors | §3.2, pp13–19, Fig6, Tables II–III; Appendix A p36 | Explain CUSUM, SPC, two-window/ADWIN and contextual approaches. Avoid treating control-chart thresholds as posterior probabilities of drift. ADWIN is a conceptual explanation, not a verified implementation recipe. |
| Learning and model management | §3.3, pp19–24, Fig7, Table IV | Distinguish retraining/incremental learning, blind/informed adaptation, local/global replacement, ensembles and recurrent models. DWM description does not prescribe an update on every sample; Appendix A contains its management period. |
| Loss and time-respecting evaluation | §3.4 and §4, pp23–28, Figs8–9, Table V | Training, detection and evaluation windows have different roles. Prediction precedes training; delayed-label handling is explicitly identified as a guide extension of the temporal requirement. |
| Dataset and resource evidence | §4.1–4.3, pp25–29; Appendix B pp38–41; Appendix C pp43–44 | Separate natural drift, synthetic streams and real data with forced drift. Specific million-example RBF/1000-window/10^-4 movement setting retained. No universal ensemble superiority or resource-price claim. |
| Application/closed-loop boundaries | §2.5, pp7–10; §5 p29 | Explain four application categories and feedback limitations. Historical open questions are not described as present-day research gaps. Historical replay is not treated as proof of live closed-loop Agent behavior. |

The guide avoids reproducing the accepted manuscript's claims that Kappa is confined to zero–one or that a repeated control threshold gives a fixed probability of a new distribution. It does not transcribe numerical ADWIN thresholds or statistical-test equations as implementation specifications. These choices keep the guide focused on supported mechanisms and their conditions without claiming an erratum review of the full article.

## Actual visual source inspection

The PDF screenshot web call failed with a content-type/screenshot-availability error. The downloaded file was instead rendered using the available local PDFium runtime. Actual page pixels inspected:

- p5: Figs1–2; class boundary versus input cloud and the five temporal-pattern examples.
- p7: Fig3; mandatory/optional arrows, feedback delay, prediction/diagnostic parts.
- p11: Figs4–5; module organization and memory taxonomy.
- p14: Fig6 and Table I; detector categories and memory classification layout.
- p19: Fig7 and Tables II–III; learning axes and detector complexity summary.
- p24: Fig8 and Table IV; loss-estimation branches and learning categories.
- p25: Table V; loss-estimation classification.
- p28: Fig9; training/validation streams separated from final test streams.
- p43: Fig11; red holdout, green accumulated test-then-train and blue sliding-window prequential curves.
- p44: Fig12; accuracy, Kappa and RAM-Hours; Leveraging Bagging's visibly greater resource cost.

No source figures or table images are copied into the website. Not every rendered page was inspected, and extracted text does not count as pixel review.

## Package verification and limits

The draft contains 5,062 Han characters, 11 reading units including orientation, and two unique body citation URLs. A project-local Node check with AJV passed the v2 metadata schema, exact UTF-8 body hash, heading/unit order and complete body URL inventory. This verifies packaging only. Full catalog validation, independent scholarly review and browser rendering remain integration steps and are not claimed by this authoring report.

Restricted download initially failed with a DNS thread error; the scoped retry downloaded the public PDF successfully. Standard and bundled Python lacked PyMuPDF; bundled PDFium and pypdf were available, so PDFium was used without adding dependencies. No experiment or algorithm implementation was run. The runtime project, scripts, schemas and Git state were not modified by this authoring task.

## Independent integration review — 2026-10-24

The integrating reviewer read the complete final guide, metadata and authoring record, and independently checked accepted-manuscript pp3–7, 12–15, 17, 21–23, 25–27, 29 and 43–44. Actual pixels on pp5, 7 and 44 were also inspected: distribution versus boundary changes, optional diagnostic flow, and the RBF accuracy/resource trade-off match the explanation. Other figure checks remain attributed to the authoring review above. No blocking factual or explanatory issue was found within the mainline scope. No experiment was reproduced; the accepted manuscript was not compared line by line with the typeset edition.

## Metadata revision 2

The complete browser suite found that the generic reading-target concept “学习” also matched the unrelated query “工具学习”. Revision 2 replaces this one concept with “在线适应”, which accurately describes the same prediction/diagnosis/update section. Only that concept and the revision number differ; the exact body, source review, coverage and all other metadata are retained. A separate reviewer verified this two-field difference. Revision 1 remains addressable, and the existing tool-learning regression assertion was preserved.
