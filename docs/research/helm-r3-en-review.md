# HELM r3 English translation note

This is an author translation, not an independent review or reader acceptance.

- Source: the Chinese r3 body and metadata; fixed arXiv 2211.09110v2 text and figure-location extract, with particular attention to PDF pages 1–5, 14–16, 25–28, 45–59, 78–82 and Appendix J. The Chinese edition's own source-check and visual-review scope is retained in the edition; this translation does not claim a new visual inspection or reproduction.
- Terminology follows the paper: joint, separate and separate-calibrated adaptation; expected calibration error and selective classification. Separate-calibrated answer scoring is distinguished from probability calibration.
- The paper's anatomy and calibration examples and the Chinese guide's hypothetical pairwise comparison work in English and were retained; no Chinese wordplay needed adaptation.
- Remaining uncertainty: Figure 7's illustrated log-probability provenance, the shot count for the 54.8% HellaSwag result, and Figure 26's treatment of ties and missing results remain unspecified in the cited discussion. Table 4 and Figures 24 and 33 were not independently checked cell by cell or point by point here.
- Checks: `node scripts/content/translation-work.mjs check helm`; structural and language statistics are reported by the command. This is not a build or a content acceptance test.
- Retranslation, 2026-11-09: the earlier English body summarized away explanatory sentences. It was retranslated paragraph by paragraph from the Chinese edition (Claude, author check only); it now has 8516 words, prose ratio 0.57 and 7.2 negations per 1,000 words. Links, figures, numbers and section structure still follow the Chinese edition; the terminology and example notes above still apply. Not independently reviewed or reader-accepted.
