# Agent Memory Survey: How Past Information Shapes the Next Decision

Once an agent can retrieve information, call tools, and carry out a sequence of steps, a basic question emerges: how can what happened before continue to influence what happens now? Saving a chat transcript is only one possibility. A system might also retain execution traces, explanations of failures, reusable skills, or knowledge encoded in model parameters. All of these can be called memory, yet they preserve different information, change in different ways, and support different behaviors.

Zeyu Zhang and colleagues organize their survey around what memory is, why agents need it, how it is implemented, and how it is evaluated. This guide follows the fixed arXiv v1 of April 21, 2024, emphasizing the relationships among its categories and the questions to ask when assessing them. It connects naturally with RAG, ReAct, and Reflexion, placing disparate methods on a shared conceptual map; it is not a general survey of real-time perception, belief revision, or dynamic decision theory. [Paper v1, §§1, 3–6](https://arxiv.org/html/2404.13501v1#S1)

## First define the boundaries memory crosses

The paper distinguishes a task, a trial, and a step. A task is the problem to be accomplished; a trial is one complete attempt to solve it; a step is one interaction within an attempt. A task may involve several attempts, each containing multiple actions and environmental feedback. These distinctions make it possible to say where earlier information came from.

In the authors' narrow definition, memory concerns the history that has already occurred within the current trial. In a teaching example, an agent inspecting equipment has established in the previous step that the power supply works. That observation should influence its subsequent troubleshooting. The broader definition also includes experience from previous trials and other tasks, as well as knowledge from outside the interaction process. The cause of a previous failed repair and the operating principles in an equipment manual could both help the current action, but they have different origins. [Paper v1, §§3.1–3.3; start at §3.1](https://arxiv.org/html/2404.13501v1#S3.SS1)

This definition is much broader than permanently stored personal information. The current context can perform a memory function, and a repository can supply memories. Conversely, a permanent database alone does not show that an agent uses history: its contents may never be selected, or may be interpreted incorrectly.

The division into trials depends on the task design. A continuing conversation might be treated as one long trial or divided into separate sessions. Whether memory crosses a trial boundary therefore tells us neither its actual duration nor whether model parameters were updated. When reading another paper, first establish which interactions its authors place within a single trial.

## Why memory matters: from keeping experience to using it

The authors motivate memory through cognitive psychology, self-evolution, and application needs. Cognitive psychology offers the idea that people accumulate experiences, form concepts, and use the past to guide behavior. This is design inspiration, not experimental proof that an agent's memory operates like a human brain.

Here self-evolution mainly involves retaining successful and failed experience, using history to decide what to explore next, and extracting transferable knowledge from particular observations. If a system simply starts over after every failure and keeps no feedback, the next attempt has no channel through which to use that experience. Yet storing a failure record is a different achievement from learning to avoid failure: the record must be found, interpreted correctly, and applicable to the new task. [Paper v1, §§4.1–4.3](https://arxiv.org/html/2404.13501v1#S4.SS1)

Applications provide more immediate reasons. A multi-turn conversation needs knowledge of earlier discussion; role simulation needs a consistent character background; exploration needs a record of actions tried and their outcomes. These concrete demands give memory its value. The benefit of additional memory depends on its use, and different tasks call for different degrees of long-term mechanism.

## Source, form, and operation are intersecting dimensions

The taxonomy in §5 is best used as a set of coordinates rather than memorized as a list of modules. Source asks where information comes from, form asks how it is retained, and operation asks how it enters memory, changes, and becomes useful. One piece of information can be described along all three dimensions at once.

| Dimension | Main categories in v1 | Relationship to distinguish |
|---|---|---|
| Source | Current trial, across trials, external knowledge | Feedback from the agent's own experience and borrowed knowledge have different evidential status |
| Form | Textual, parametric | Information is supplied explicitly to the model or influences behavior through its parameters |
| Operation | Writing, management, reading | Whether content can be saved, how it changes, and whether it can be used when needed |

Suppose a failure is summarized as “for this kind of input, check the boundary conditions first,” for use in the next trial. Its source is cross-trial experience and its form is text. Writing and management turn execution feedback into experience; reading brings that experience into the current task. Fine-tuning a model on the same experiences preserves the cross-trial source but changes the form and the cost of updating. This is a teaching application of the classification, not an additional experiment from the paper. [Paper v1, §§5, 5.1–5.3](https://arxiv.org/html/2404.13501v1#S5)

Each source plays a role. Current-trial history is usually closest to the immediate task but may lack earlier experience. Cross-trial content can support error avoidance and transfer, although the old and new situations may differ. External knowledge gives an agent access to facts it did not have to discover itself, while still requiring checks on provenance and currency. V1 calls external knowledge information outside the interaction loop and also discusses obtaining it dynamically through tools. “External” describes its source, not an assurance that the outside world never changes.

These coordinates also clarify the relationship to other work. RAG helps explain retrieval and use of external knowledge; ReAct shows how reasoning, action, and observation form a process; Reflexion highlights the conversion of post-trial feedback into text that a later attempt can use. These are editorial conceptual connections, not a claim that all three employ the same memory algorithm.

## Textual and parametric memory place costs in different places

Textual memory supplies content explicitly to the model. The paper discusses full interaction histories, recent interactions, retrieved interactions, and external knowledge in this category. These choices can be combined: a system might retain recent context while retrieving older passages.

A full history reduces losses from advance selection, but increases input length and computational burden; the position of material in the context can also affect its use. Keeping only recent content controls input size, at the risk of pushing an important earlier condition out of the window. Relevance retrieval can recover distant information, but moves the problem to retrieval: does the query express the real need, do the candidates omit necessary evidence, and is retrieval fast enough? [Paper v1, §5.2.1](https://arxiv.org/html/2404.13501v1#S5.SS2.SSS1)

A textual implementation can also use vectors. Encoding a passage as a vector for indexing, then sending the retrieved text to the model, remains textual memory in this survey's sense. The representation used by a retrieval index and the question of whether knowledge is written into model parameters are different issues.

Parametric memory changes model parameters so that knowledge or experience influences later outputs. The authors mainly discuss fine-tuning and knowledge editing: the former updates a model using data, while the latter targets particular facts. Neither requires the same passage to be placed in every prompt, but writing can involve training, data preparation, and additional computation, and can affect existing knowledge. [Paper v1, §§5.2.2–5.2.3](https://arxiv.org/html/2404.13501v1#S5.SS2.SSS2)

The authors' characterization of text as easier to write and parameters as easier to read is therefore a comparison of where costs fall, not a speed law for every system. Parametric memory avoids a separate prompt entry for each item, while its capacity and fidelity remain limited. Knowledge editing aims to preserve unrelated knowledge, but the paper recognizes that doing so remains a challenge rather than a guarantee.

## Writing, management, and reading together determine usefulness

Writing turns new observations into stored content. Raw records preserve details for later inspection but can contain much repetition and noise. Summaries are concise, but decide in advance which details to keep. This choice affects more than storage format: once a summary omits a condition, even sophisticated retrieval cannot recover that condition from the summary itself.

Management continues to process existing content. The survey groups its operations into consolidation, reflection, and forgetting: consolidation reduces repetition, reflection extracts higher-level information from particular experiences, and forgetting reduces the influence of irrelevant material. These operations change meaning as well as length. For example, compressing “this failure may have involved condition A” into “A causes failure” turns a tentative explanation into a general rule. This is the guide's analysis of an evidential risk, not an experimental result reported by the paper.

Reading selects information needed now. The paper discusses similarity retrieval, selection combining recency and importance, and structured queries using SQL. For parametric memory, inference with the updated model can be viewed as implicit reading. Writing and reading must work together: if only the outcome of an event is saved, later attempts to explain a failure may lack the necessary process evidence. [Paper v1, §§3.4, 5.3.1–5.3.3](https://arxiv.org/html/2404.13501v1#S3.SS4)

These three operations let us break “failure to remember” into specific cases: information never entered memory; it was compressed or replaced; it remains stored but was not retrieved; or it was retrieved but used incorrectly. They can produce the same final error, yet call for different remedies.

Forgetting belongs in the same analysis. A fact unused recently may still be needed later, and repeated events may have occurred at different times or under different conditions. The learning problem is how much information to retain for anticipated future tasks. The survey provides categories and examples, rather than an optimal forgetting rule for every possible future question.

## Evaluation distinguishes facts, evidence, and task completion

The paper divides evaluation into direct and indirect approaches. Direct evaluation tries to focus on the memory mechanism itself; indirect evaluation measures an agent with memory on a complete task. The distinction matters because a correct answer can arise despite a memory failure, while an error can originate elsewhere. [Paper v1, §§6.1–6.3](https://arxiv.org/html/2404.13501v1#S6.SS1)

Direct evaluation includes subjective and objective approaches. Subjective assessment examines whether recalled content is coherent and reasonable in context. It suits cases without a single easily specified answer, although the evaluators and their criteria influence the result. Objective assessment includes answer correctness, retrieval quality for reference memories, and time and hardware costs.

Answer correctness and reference accuracy are particularly easy to confuse. The first asks whether the final answer matches the target; the second asks whether the appropriate memories were found. In a teaching example, a system might guess the answer correctly from common knowledge without retrieving the designated historical record. Conversely, it might retrieve the right record and reverse the order of events while reasoning. The two measures thus provide different information.

The paper uses Precision, Recall, and F1 in its discussion of reference accuracy. Precision asks what fraction of retrieved content is relevant; Recall asks what fraction of the content that should have been found was recovered; F1 combines the two. These measures depend on a previously labeled set of relevant memories. Their scope leaves the faithfulness of a generated explanation and the quality of a sequence of actions to other assessments. Efficiency also involves more than final generation time: the time and resources spent writing, managing, and reading deserve separate attention. [Paper v1, §6.1.2](https://arxiv.org/html/2404.13501v1#S6.SS1.SSS2)

Indirect evaluation covers dialogue, question answering across multiple sources, long-context tasks, and other applications such as code test pass rates or exploration outcomes. It is closer to practical use, but model capability, prompting, tools, and task setup can all affect the score. The paper accordingly cautions against attributing the entire end-to-end improvement to memory. Experiments are more informative when other conditions are controlled and performance is compared with memory removed or replaced.

The v1 authors also observed a lack of dedicated open-source benchmarks for agent memory modules at the time. This was a judgment about the field in the 2024 version, not a claim about the present. This guide offers no current ranking of methods and has neither reproduced nor re-compared the experiments in the cited work.

## Applications change what good memory means

The survey lists role-playing and social simulation, personal assistants, open-world games, code generation, recommendation, and domain expert systems. Their differences show why a single score cannot capture every kind of good memory. Role simulation cares about consistency of background and behavior; an assistant must connect present needs with earlier interactions; games emphasize reuse of experience and skills. Code tasks connect errors, modifications, and verification feedback, while recommendation and expert systems depend on relevant preference information or domain knowledge. [Paper v1, §§7.1–7.7](https://arxiv.org/html/2404.13501v1#S7.SS1)

In their outlook, the authors discuss parametric memory, coordination of memory across agents, lifelong learning, and human-like agents. Long operation magnifies questions of temporal relationships, growing information, and forgetting; multiple agents add information sharing and asymmetry. Human-like simulation may even aim to model forgetting or knowledge boundaries rather than maximize how much is remembered. These are research directions proposed by the authors, not capabilities uniformly solved by the paper. [Paper v1, §§8.1–8.4](https://arxiv.org/html/2404.13501v1#S8.SS1)

The survey is most useful as a set of coordinates for further reading. For a new memory paper, identify whether its change concerns source, form, or operation, then ask whether its evidence supports an improvement in storage, retrieval, or use. Revising judgments in a continuing environment, deciding when to act, and allocating computation require further study beyond this map; increasing memory capacity alone cannot answer them.

## Reading the paper and coverage

A useful route begins with §§3.1–3.4 on task, trial, step, and the three memory operations. Then read §§5.1, 5.2.3, and 5.3 together to distinguish sources from forms and understand how reading and writing relate. Finally, §§6.1.2 and 6.3 clarify what different evaluations actually measure. Links point to section anchors that exist in the fixed v1 HTML. A label spanning subsections opens the first listed section; continue by section number. If the reader does not jump to the anchor, locate the same section manually. [Original reading entry: v1 §§3, 5, 6](https://arxiv.org/html/2404.13501v1#S3)

The Chinese guide reports reading the core text on definitions, motivation, sources, forms, operations, and evaluation, with selected reading of applications and outlook. Tables 1–3 were used to check taxonomy headings and the placement of representative methods; the cited papers were not all individually reexamined. For revision 2, the guide's author additionally inspected the pixels of Figures 3–5 in the fixed v1 PDF: Figure 3 for task, trial, step, connections to writing, management, and reading, and the dashed cross-trial lines; Figure 4 for the three parallel perspectives of source, form, and operation; and Figure 5 for the subjective and objective branches of direct evaluation and indirect task evaluation. The external works cited as examples in the figures were not individually audited, and the figures are not reproduced here. Figures 3, 4, and 5 appear on physical pages 8, 11, and 20, respectively, with the same printed page numbers. If a PDF link does not jump, enter the physical page number manually. [Figure 3: interaction and memory operations, PDF physical page 8](https://arxiv.org/pdf/2404.13501v1#page=8); [Figure 4: three dimensions, PDF physical page 11](https://arxiv.org/pdf/2404.13501v1#page=11); [Figure 5: evaluation branches, PDF physical page 20](https://arxiv.org/pdf/2404.13501v1#page=20).

This is a mainline guide to the principal categories and arguments, not a full survey. It does not individually verify every related study, reproduce experiments, or cover advances after 2024. The teaching examples and analysis of evidential risk were created for the guide to explain the paper's concepts; they are not the paper's experimental findings.

[Complete fixed v1 HTML](https://arxiv.org/html/2404.13501v1)
