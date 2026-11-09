# ReAct: Bringing Reasoning, Acting, and Environmental Feedback into a Loop

A model given a question can answer immediately or write out intermediate reasoning. But when the facts needed to solve it are absent from the question, how can it check an intermediate fact it has invented? A model with access to search or a website faces another problem: deciding what to look for, what to do with the result, and when the task is complete.

In their ICLR 2023 paper, *ReAct: Synergizing Reasoning and Acting in Language Models*, Shunyu Yao and colleagues connect these two activities. The language model writes its current thought, generates an action that an environment can execute, and incorporates the returned observation into its context before thinking or acting again. The authors call this interleaving ReAct, for reasoning and acting. [Abstract and §1, PDF pp. 1–3](https://arxiv.org/pdf/2210.03629v3)

The text in a trajectory has different origins. A model saying “I need to look up this name” is making a plan; the interface response after the search is an observation of that action. The model can then reformulate the query, change subgoals, or submit an answer. Figure 1 makes this concrete with two trajectories: one resolves an ambiguous encyclopedia search, while another finds a pepper shaker in a simulated room and puts it in a drawer.

The paper tests the method with a frozen PaLM-540B and a few human demonstrations, and also studies fine-tuning smaller models on trajectories. In question answering, ReAct beats an action-only comparison on both datasets but trails reasoning-only CoT on HotpotQA. In household and shopping tasks, prompts with thoughts achieve higher success rates. We first establish the tasks and interfaces, then follow the two trajectories and their underlying loop, and finally examine what the experiments support. The key is to track where each piece of information comes from and how it enters the next decision. [§2–4, PDF pp. 3–8](https://arxiv.org/pdf/2210.03629v3#page=3)

## Background: What reasoning alone and acting alone leave out

The authors start from two approaches that face different obstacles when a task provides incomplete information.

The first is chain-of-thought (CoT) prompting. Given examples with intermediate steps, a language model can lay out its reasoning before answering. This helps make a multi-step solution visible: a reader can see a judgment and how it leads to a conclusion. But a step may rest on an incorrect fact, and fluent subsequent reasoning can carry that error forward if no external information enters the process. In Figure 1, the question-answering example starts with a wrong program name and ends with a wrong answer. [§1 and Figure 1, PDF p. 2](https://arxiv.org/pdf/2210.03629v3#page=2)

The second approach has the model generate actions, such as submitting a search or moving and picking up objects in a simulated room. Actions can bring in information beyond the question or change the environment. In a long task, however, the sequence needs organizing: the model must use feedback to track objects found, places checked, and the current subgoal. In Figure 1, an action-only model twice tries to take a pepper shaker from a sink even though the observation lists no shaker there.

The authors want the approaches to complement one another: act to inform a judgment, and reason to select an action. Search can return a program name that guides another search; movement can reveal an object and prompt a plan update. The focus is an interaction unfolding step by step rather than a fixed plan generated all at once.

## Tasks and interfaces: What the model can actually do

The paper formalizes an agent interacting with an environment. At time $t$, it receives observation $o_t$ and chooses action $a_t$ using context $c_t$, which contains previous observations and actions as well as the current observation. The policy $\pi(a_t\mid c_t)$ describes how an action is selected from that history. This notation describes decision-making; the main prompting experiments do not thereby become reinforcement-learning training. [§2, PDF p. 3](https://arxiv.org/pdf/2210.03629v3#page=3)

The authors expand the available action space to:

$$
\hat{\mathcal A}=\mathcal A\cup\mathcal L
$$

Here $\mathcal A$ is the set of actions accepted by the environment and $\mathcal L$ is the space of natural-language text. A thought is added to the context for later generation. It does not itself change the external environment, so it produces no new environmental observation. For an environment action, an executor sends the action to the environment and appends the response to the trajectory. Generating both kinds of content with the same language model is central to the design.

For question answering, the authors designed a simple Wikipedia interface with three actions. [§3.1, PDF p. 4](https://arxiv.org/pdf/2210.03629v3#page=4)

| Action | Purpose | Response or consequence |
| --- | --- | --- |
| `search[entity]` | Find a page by entity name | Returns its first five sentences if found; otherwise suggests up to five similar entities |
| `lookup[string]` | Find a string on the current page | Returns the next sentence containing it |
| `finish[answer]` | Submit an answer | Ends the task |

The interface relies mainly on page names and returns a small portion of a page at a time. The authors describe it as weaker than advanced lexical or neural retrievers. This choice makes the search process visible: the model must turn the question into entity names and decide whether a result is sufficient. `lookup` presupposes a current page; searching within that page differs from searching for a new one.

The interface also separates responsibilities. `search[Front Row]` is the model's request, not page content. A failure message and candidate names returned by the interface are the observation; choosing a candidate is again the model's job. An error can occur either before the request or after its response.

## Overview: Four ways through Figure 1

![Figure 1 compares four question-answering trajectories above and two household trajectories below. ReAct searches Apple Remote, finds Front Row, selects Front Row (software) after a failed search, and answers keyboard function keys. Act reaches the software page but answers yes; CoT starts from Apple TV. In the household task, Act twice tries unsuccessfully to take a pepper shaker from a sink; ReAct finds one on a countertop, opens a closed drawer, and puts it there. Green marks useful information, red errors, and blue thoughts.](assets/react/figure-1-trajectories.webp "Figure 1: Question answering above and an interactive household task below; follow each trajectory downward")

The top half compares four approaches to the same multi-hop question; the bottom compares two approaches to the same household task. Read the four upper columns downward from the question, with ReAct in the large box on the right. Below, Act is on the left and ReAct on the right. Green emphasizes useful content, red marks errors or ineffective actions, and blue marks thoughts in the household task. These are individual trajectories; the demonstrations in the prompts are omitted. [Figure 1, PDF p. 2](https://arxiv.org/pdf/2210.03629v3#page=2)

**First, the question's dependencies.** Aside from Apple Remote, what device can control the program it was originally designed to operate? One must first identify the original program, then find another way to control it. The second lookup depends on the name obtained in the first: this is a multi-hop question. Finding Apple Remote alone leaves the other half unanswered.

Standard answers iPod directly. CoT writes intermediate steps but assumes the original program was Apple TV, then lists iPhone, iPad, and iPod Touch. Its reasoning is legible, but the first factual premise is wrong. Act can search and finds both Front Row and the disambiguated software page, yet ends with `Finish[yes]` instead of the requested device. Finding material and using it correctly are separate steps.

ReAct's trajectory on the right involves four model judgments:

| Thought and action | External observation | Effect on the next step |
| --- | --- | --- |
| Look for the original program; search Apple Remote | The page excerpt names the Front Row media center program | Use the program name as the next query |
| Look for another control device; search Front Row | The name is not found; similar entities include `Front Row (software)` | Choose the disambiguated software name |
| Search `Front Row (software)` | A software-page excerpt returns | Look for its control methods |
| Synthesize keyboard function keys; submit `Finish[keyboard function keys]` | Task ends | Turn the facts into the requested answer |

Two threads run through the trajectory. The task thread ends at another control device; the program name is an intermediate result. The entity thread moves from Apple Remote to Front Row, then disambiguates Front Row to a software page. The second thought keeps both threads alive: it remembers the program already found and the device still needed. Retaining only the name could lead to stopping too early; merely repeating the original question could lose the next search target.

After the third search, the model must compare the two control methods with the question's exclusion: Apple Remote is already excluded, leaving keyboard function keys. This final synthesis explains how Act can reach the same software page and still fail with `Finish[yes]`: the interface supplies material, but the model must map the question's conditions to the required answer form.

The failed second search is especially useful. It returns candidate entities, giving the model a way to recognize the missed query and select the software page. The failure exposes the interface's reliance on accurate names while providing a clue for recovery. The third observation is abbreviated in the figure; the final thought states that keyboard function keys were synthesized from the software page.

**Now the household task.** The initial observation lists fixtures in a room, and the goal is to put a pepper shaker at a drawer. Act opens the drawer and sees a sponge and spoon; at the sink it sees a sponge, spatula, and another spoon. It twice tries to take a shaker from the sink, and twice the environment says “nothing happens.” The observation described the available objects, but the action did not change accordingly.

ReAct first divides the task into finding the shaker and placing it, using common sense to suggest cabinets and countertops. It checks locations, with some movement omitted from the figure, and observes the shaker at countertop 3. After taking it and receiving confirmation, the model writes a new thought: the object is found, so placement comes next. It goes to the drawer, observes that it is closed, opens it, and places the object; the environment confirms the placement.

The two thoughts do different work: the first proposes a search order, while the second switches subgoals after pickup. The closed-drawer observation calls for an extra opening action. Common sense guides where to look; environmental feedback supplies the actual state. Some movement is omitted, and these two cases give no complete comparison of search cost. Overall success is evaluated later on 134 games.

## The core loop: How an observation changes the next step

Reconstructing the system around the illustrated trajectories makes each input and output visible. Suppose a new question and demonstrations have been sent to the model:

| Stage | Produced by | What happens |
| --- | --- | --- |
| Thought | Model | Writes a goal, judgment, or plan using the question and history |
| Action | Model | Outputs a search, lookup, or finish instruction in the interface format |
| Execution | External executor and environment | Runs the instruction and returns text or a state change |
| Observation | Environment | Appends the response to the trajectory as part of the next input |
| Continue or finish | Model | Uses the updated context to select another step or submit an answer |

After the second Apple Remote search, the context includes the original question, the first search and its page, the second query, and the failure candidates. The third thought is generated from that expanded history. Without the returned failure the candidate list is unavailable; even when it is appended, the model might ignore it and repeat the query. ReAct provides a route for feedback to affect a decision, while the model must still generate the right continuation.

From the executor's perspective, a round is more than a model writing an uninterrupted answer. The model emits a recognizable action, the executor sends it to the interface and waits, and the next generation receives the question, demonstrations, and accumulated trajectory. Even “no result” or “nothing happens” records the consequence of an action. The important question is whether the continuation uses that record.

Thought changes the subsequent context and decision; an environmental action can change observable external state. Wikipedia search changes available information, while opening a drawer or picking up a shaker also changes the room. Distinguishing a model's claim that it picked something up from the environment's confirmation shows how far the task has actually progressed.

The paper lists several uses of thoughts: decomposing a problem, extracting observations, applying common sense or arithmetic, reformulating searches, tracking progress, and synthesizing answers. Free-form model-generated text performs these functions. In Figure 1, one thought extracts Front Row from a page; another handles a search exception. Their forms are similar, but they support different decisions. [§2 and §3.2, PDF pp. 3–5](https://arxiv.org/pdf/2210.03629v3#page=3)

Thought density varies with the task. Question-answering demonstrations usually put a thought before each action, producing several Thought–Action–Observation groups. Household tasks can require dozens of actions, so the model inserts thoughts sparsely where it chooses. In Figure 1, several movements have no written rationale between them, while pickup triggers a clear subgoal change. [§2, PDF pp. 3–4](https://arxiv.org/pdf/2210.03629v3#page=3)

The two loops share a structure but have different completion criteria. In question answering, search yields the next entity or a candidate for a corrected query, and the product is enough evidence to answer. In the household task, movement reveals a local object list, while pickup and opening change state; the product is the required state of the environment. Preserving trajectories helps distinguish never finding the right page from finding it but submitting the wrong answer, or never finding the shaker from failing to place it. Those diagnoses suggest different improvements to queries, use of observations, and interfaces.

Demonstration thoughts show a way of working; thoughts on a new task are newly generated from its context. A demonstration may illustrate search and inspection, but actual results depend on the new action and interface response. Treating a demonstration's observation as evidence for the new task would mix two trajectories.

Time order matters: an action is issued, the environment returns its consequence, and the next generation can use that observation. Treating the model's prediction as an executed tool result would leave a self-consistent piece of text rather than an inspectable interaction. The paper's Act and Obs labels make this boundary visible. Readable thoughts are still generated text and do not guarantee faithful disclosure of internal computation; alongside actions and observations, they allow the decision sequence to be inspected.

## Demonstrations and comparisons: Teaching the loop

How does the model acquire the format? The main experiments use few-shot prompting: human-written complete trajectories are placed in the input before a new task, and frozen PaLM-540B continues in the demonstrated style. The examples contain thoughts, actions, and observations. The authors randomly select six HotpotQA and three FEVER training examples and manually compose trajectories. [§2 and §3.2, PDF pp. 3–5](https://arxiv.org/pdf/2210.03629v3#page=3)

HotpotQA is multi-hop question answering, often requiring information from two or more Wikipedia passages. FEVER asks whether a claim is supported, refuted, or lacks sufficient information. The experiments supply only the question or claim, without supporting passages. ReAct and Act can use the encyclopedia interface; reasoning-only approaches rely on the input and model knowledge.

Few-shot examples differ from fine-tuning data. In prompting, examples and a new task enter the context while parameters remain frozen; the model imitates the format through continuation. In the later fine-tuning experiment, many trajectories update the parameters. The text format can be similar even though the adaptation and results differ.

Demonstrations show both the format and how a task proceeds: when to look up another entity, continue after an insufficient result, or finish. Authors write the question-answering reasoning and actions, with observations corresponding to interaction returns; a new question receives its own interface observations. Figure 1 omits demonstrations, so it does not reveal the full prompt length.

The authors derive comparisons from ReAct trajectories. Standard removes thoughts, actions, and observations and answers directly; CoT keeps thoughts but removes actions and observations; Act keeps actions and observations but removes thoughts. This correspondence makes trajectory format a clearer comparison, although generated continuations can still visit different pages and produce different answers.

A further comparison is CoT self-consistency (CoT-SC): sample several CoT trajectories for the same question and take the most frequent answer. Table 1 uses 21 samples at temperature 0.7, so its generation budget differs from a single trajectory. Agreement supplies a voting signal, though several paths can repeat the same error. [§3.2, PDF p. 5](https://arxiv.org/pdf/2210.03629v3#page=5)

## Question-answering results: Retrieval helps and introduces failures

Table 1 asks what combining thoughts and external actions changes with the same base model. HotpotQA uses exact match (EM), and FEVER uses classification accuracy (Acc); higher percentages are better. [Table 1, PDF p. 5](https://arxiv.org/pdf/2210.03629v3#page=5)

| Prompting method | HotpotQA EM | FEVER Acc |
| --- | ---: | ---: |
| Standard | 28.7 | 57.1 |
| CoT | 29.4 | 56.3 |
| Act | 25.7 | 58.9 |
| ReAct | 27.4 | 60.9 |
| CoT-SC, 21 samples | 33.4 | 60.4 |
| CoT-SC → ReAct | 34.2 | 64.6 |
| ReAct → CoT-SC | 35.1 | 62.0 |

ReAct exceeds Act by 1.7 and 2.0 percentage points, consistent with thoughts helping organize actions and synthesize answers. Against CoT, ReAct is 4.6 points higher on FEVER but 2.0 lower on HotpotQA. The authors suggest that supported and refuted FEVER claims can differ in small details, making accurate retrieval particularly useful; this is an explanation based on task characteristics, not a separately controlled test of that factor.

To investigate the difference, the authors manually analyze 50 correct and 50 incorrect HotpotQA trajectories for each of ReAct and CoT, 200 in total. Each method and outcome has its own denominator of 50. Among correct answers, 94% of ReAct trajectories have both reasoning and facts labeled correct, with 6% false positives; CoT has 86% and 14%, respectively. Table 2's false positives include hallucinated reasoning or facts despite a correct final answer. [§3.3 and Table 2, PDF p. 6](https://arxiv.org/pdf/2210.03629v3#page=6)

Among incorrect answers, ReAct's categories are reasoning error 47%, empty or unhelpful search 23%, and a correct prediction without an exact label match 29%. CoT's main categories are reasoning error 16%, hallucination 56%, and label ambiguity 28%. ReAct's hallucination entry is 0%: none of those 50 incorrect examples received that label. Percentages are rounded, so some rows do not add exactly to 100%.

The authors include repeated thoughts or actions with failure to recover among reasoning errors, and note that some labels may be outdated. With only 50 samples per method and outcome group, these proportions help identify types of failure rather than estimate precise population frequencies. External knowledge can reduce fabrication, yet search can also fail to return usable material. This motivates the mixed methods that follow.

Tables 1 and 2 answer different questions. Table 1 scores final answers under each task's evaluation rule. Table 2 first groups trajectories by correct or incorrect final answer, then examines sampled reasoning and facts. The 6% in the correct ReAct group and 23% in its incorrect group have separate denominators; neither is a share of all test questions. An unhelpful search concerns evidence gathering, while a correct prediction that misses the label concerns the evaluation label or matching rule. Looking at trajectories alongside final scores reveals distinctions that exact match alone cannot capture.

## Connecting CoT and ReAct: Benefits and extra budget

Can one method take over when the other encounters a difficulty? The paper proposes two combinations. Arrows indicate order, rather than both procedures necessarily running on every question. [§3.2–3.3 and Figure 2, PDF pp. 5–6](https://arxiv.org/pdf/2210.03629v3#page=5)

**ReAct → CoT-SC: interact first, vote after a timeout.** Run ReAct and fall back to multiple CoT samples if it has not submitted an answer within the allowed steps. The limits are 7 steps for HotpotQA and 5 for FEVER; the authors report that adding steps did not improve ReAct. This trigger detects a trajectory that takes too long: a quickly submitted wrong answer does not itself trigger fallback.

**CoT-SC → ReAct: vote first, search when disagreement is high.** Sample $n$ CoT answers and switch to ReAct if the most frequent answer occurs fewer than $n/2$ times. The threshold is strictly below half; exactly half does not meet it. In a guide-created five-vote example, A, A, B, C, D gives the leading answer 2 votes, fewer than 2.5, so ReAct takes over. A, A, A, B, C gives A three votes and retains it.

The triggers monitor different failures. The first watches whether a process ends on time, handing a repeating search to voting at the limit. The second watches whether completed answers concentrate, using disagreement to trigger search. Each can incur extra cost at a different stage, and neither checks every intermediate step for support. After fallback, the former offers a fresh solution without relying on the current search trajectory; the latter can bring in information absent from the votes.

Imagine several CoT paths all mistakenly identify Apple TV as Apple Remote's original program: a majority vote could retain that error. If the paths instead give different names, the rule can invoke external search. This teaching scenario is constructed from Figure 1; the paper does not report the actual voting distribution for that question. A majority measures agreement, while external observation supplies a different kind of information. Dispersed votes can also reflect different wording, so the threshold alone does not verify an answer.

In Table 1, the best HotpotQA prompting result is ReAct followed by fallback, at 35.1; FEVER's best is CoT-SC followed by fallback, at 64.6. Figure 2 varies the number of CoT-SC samples. The authors observe overall advantages for the combinations across sample counts and report reaching the 21-sample CoT-SC level with about 3–5 CoT samples on these tasks. Some low-sample curves coincide, so this is not strict superiority at every point. The horizontal axis counts CoT samples only; hybrid strategies can also run ReAct and Wikipedia searches. Total cost requires search counts, generation lengths, and waiting times too.

## Fine-tuning: Why the ranking changes for smaller models

![Figure 3 has two bar charts of HotpotQA exact match by model size: prompting on the left and fine-tuning on the right. Colors denote Standard, CoT, Act, and ReAct. At 8B and 62B, prompted ReAct is below the other three methods, while fine-tuned ReAct is above them. The fine-tuning chart has no 540B bars.](assets/react/figure-3-scaling.webp "Figure 3: Prompting on the left, fine-tuning on the right; the latter has no 540B fine-tuning bars")

The previous results prompted a frozen model. Figure 3 asks whether training smaller models to produce the same trajectories changes their ability to use the format. Both charts show HotpotQA exact match, with colors for Standard, CoT, Act, and ReAct. The right chart shows fine-tuned 8B and 62B results, but no fine-tuned 540B bar. [§3.2–3.3 and Figure 3, PDF pp. 5–7](https://arxiv.org/pdf/2210.03629v3#page=7)

For each method, the authors use 3,000 model-generated trajectories with correct final answers to fine-tune PaLM-8B and PaLM-62B separately. With prompting alone, ReAct ranks below the other three methods at both sizes; after fine-tuning it ranks first at both. The paper also reports that fine-tuned 8B ReAct exceeds every 62B prompting method, and fine-tuned 62B ReAct exceeds every 540B prompting method.

The authors suggest small models struggle to learn thoughts, actions, and switching from a few examples, while more trajectories give them a chance to learn the format. They also suggest action trajectories teach access to Wikipedia, whereas direct-answer trajectories lean toward memorizing facts. These are interpretations of the results; filtering by final answer does not ensure each intermediate step is correct. Figure 3 compares different adaptation conditions, making training as well as model size relevant to the ranking.

## ALFWorld: Managing long tasks with sparse thoughts

Wikipedia search mainly returns information; ALFWorld requires a model to change a simulated environment step by step. This text-based household game has six task types, such as finding paper and examining it under a desk lamp. An instance can have over 50 locations, and an expert policy can take more than 50 steps. The model must maintain state from local observations and past actions. [§4, PDF p. 7](https://arxiv.org/pdf/2210.03629v3#page=7)

Such tasks test thought because the goal is more abstract than any single action. Examining paper requires finding both paper and lamp and using the lamp. The model sees a textual description of its current location and must remember its exploration and what it holds. Closed containers and objects absent from a location can force a change in action. These demands create opportunities for decomposing goals and tracking progress.

Figure 1's switch from searching to placing is one example. For longer tasks the model must continue tracking the current subgoal through many movements and responses.

The authors annotate three training trajectories with sparse thoughts for each of the six task types. They choose two in order as demonstrations, yielding six prompts per type. Act uses the same trajectories with thoughts removed. Evaluation covers 134 unseen games. The table excerpts overall success rates from Table 3; higher is better. [§4 and Table 3, PDF pp. 7–8](https://arxiv.org/pdf/2210.03629v3#page=8)

| Method | Prompt or result selection | Success rate |
| --- | --- | ---: |
| Act | Best of six | 45% |
| ReAct | Average of six | 57% |
| ReAct | Best of six | 71% |
| ReAct-IM | Average of six | 48% |
| ReAct-IM | Best of six | 53% |
| BUTLER | Best of eight | 37% |

The 71% is the best prompt, whereas 57% is the six-prompt average; the authors report that each corresponding ReAct prompt beats Act. Best ReAct exceeds BUTLER's 37% by 34 percentage points, a difference that should not be described as the average gain. BUTLER uses expert trajectories for imitation learning under different resource and selection conditions. The table note also says BUTLER uses beam search while the other methods use greedy decoding.

The distinction between demonstrations and unseen games matters: on a new game the model must continue from new observations rather than copy object locations from a demonstration. The few examples guide behavior on top of its pretrained knowledge.

There are three levels to the comparison. Matched Act and ReAct prompts use the same training examples and mainly differ in whether thoughts remain; the authors report an advantage in all six pairs. ReAct's average and best show variation with demonstration choice and order. BUTLER provides a different reference method, with different expert-trajectory training and decoding.

Table 3 also separates Pick, Clean, Heat, Cool, Look, and Pick 2. The higher overall best ReAct score does not imply that it exceeds every baseline on every task: BUTLER reaches 100 on Cool versus 86 for best-prompt ReAct. The overall column summarizes performance, while task columns show differences across activities.

ReAct-IM is an ablation with dense external-feedback-style thoughts resembling Inner Monologue. Its best result is 53%, compared with ReAct's 71%. The authors observe that it often struggles to tell when a subgoal is complete, what comes next, or where an object is likely to be. The comparison motivates examining the content and organization of thoughts, not just how much text appears.

## WebShop: Attribute score and complete success

WebShop replaces the room with a shopping research website. Given a natural-language request, the model searches products, examines titles and descriptions, chooses options, and executes a purchase action. The paper describes about 1.18 million real products and 12,000 human instructions, with evaluation on 500 test instructions. Purchasing in the research environment involves no real payment. [§4, PDF pp. 7–8](https://arxiv.org/pdf/2210.03629v3#page=7)

A difficulty is that requirements and page content can use different wording. The paper's example asks for a nightstand with drawers, a nickel finish, and a price below $140. Search can start with the product type and drawers; after results arrive, the model must check price and available colors. A title alone cannot establish that every option satisfies the request. The model must compare observations with each requirement and decide whether to explore further or buy.

The actions form a feedback loop: turn requirements into a search query, observe results, choose a candidate, inspect options and description, then select options and purchase or return to search. Sparse thoughts can connect conditions scattered across the instruction and page. Unlike the household task, the central comparison is among product attributes rather than movements and objects in a room.

The two interactive experiments therefore test related formats in distinct settings. ALFWorld emphasizes multi-step goals and local state; WebShop adds noisy text and matching among products, options, and requirements. Each has its own action space, prompts, data, and metrics.

The paper uses two metrics. Score is the proportion of requested attributes satisfied by the selected product, averaged over tasks. Success rate (SR) counts tasks whose requirements are all satisfied. Higher is better. [Table 4, PDF p. 8](https://arxiv.org/pdf/2210.03629v3#page=8)

| Method | Average attribute score | Complete success rate |
| --- | ---: | ---: |
| Act | 62.3 | 30.1 |
| ReAct | 66.6 | 40.0 |
| Imitation learning (IL) | 59.9 | 29.1 |
| IL + reinforcement learning | 62.4 | 28.7 |
| Expert human | 82.1 | 59.6 |

ReAct exceeds Act by 4.3 points in attribute score and 9.9 percentage points in complete success. In a guide-created example, a product with the requested color and size but over budget could earn partial attribute credit while failing complete success. The metrics capture “how many conditions” and “all conditions” respectively.

The research website presents product information as text and accepts actions such as search and click. The authors inspect whether trajectories identify instruction-relevant information in titles, descriptions, and options. Even an apparently relevant candidate requires checking individual options and price before ending the search.

The aggregate score increase indicates more conditions covered on average, and the success-rate increase indicates more tasks satisfying all requirements. These two numbers alone cannot identify whether the gain came from better queries, more product exploration, or final option selection. The authors' trajectory inspection suggests that reasoning between page content and requirements is one possible mechanism; the table supplies the overall comparison.

The authors observe that ReAct more often uses thoughts to connect noisy pages to relevant options, while expert humans more often explore products and reformulate queries. These observations of examples are not causal proof for every success. IL trains on 1,012 human-annotated trajectories, and IL+RL additionally uses 10,587 training instructions, so training resources differ from prompting. The expert human score of 59.6 for complete success also shows that meeting all requirements remains difficult in this test.

## Limitations, risks, and further reading

A trajectory can go astray through a wrong entity query, an unhelpful return, an ignored observation, or repeated actions in a long task. Complex action spaces may need more demonstrations, while demonstrations and growing trajectories consume input length. The authors propose more high-quality annotations, multi-task training, and combining the method with reinforcement learning as future directions. [§6, PDF pp. 9–10](https://arxiv.org/pdf/2210.03629v3#page=9)

Action permissions also create safety risks. The authors discuss queries for private or inappropriate information and harmful actions, and limit the sites and action sets in their experiments, including prohibiting Wikipedia edits and real WebShop purchases. Permissions, confirmation, and reversal in an actual system require design for that environment. [Ethics statement, PDF p. 10](https://arxiv.org/pdf/2210.03629v3#page=10)

As an editorial reading sequence, CoT emphasizes intermediate reasoning; ReAct incorporates actions and external observations in the trajectory. Retrieval-augmented generation emphasizes supporting generation with retrieved material, while ReAct also focuses on when to act and how to handle feedback. Continue with this library's [RAG survey](/read/rag-survey/5#u05) and [Toolformer](/read/toolformer/1#u01) to compare multi-round retrieval and tool use.

## Returning to the paper: Checking evidence along trajectories

Figure 1 and §2 are entry points to the method: follow the failed Apple Remote search to its candidate entity, then identify the two subgoal judgments in the pepper-shaker trajectory. The figure omits prompt demonstrations; appendices C and D give more demonstrations and trajectories. [Figure 1 and §2, PDF pp. 2–4](https://arxiv.org/pdf/2210.03629v3#page=2)

Read Tables 1 and 2 together: compare final metrics, then track the separate denominators for each method and outcome in the manual error analysis. Figure 2's horizontal axis counts CoT-SC samples; Figure 3 distinguishes prompting from fine-tuning. Tables 3 and 4 show household prompt selection and the two shopping metrics. [Figures 2–3 and Tables 1–4, PDF pp. 5–8](https://arxiv.org/pdf/2210.03629v3#page=5)

This guide is based on the fixed arXiv v3 main text, §1–6 and the ethics statement. Figures 1 and 3 are from the fixed PDF; the CC BY 4.0 license record is carried forward from r2 and was not independently checked online for this revision. Tables excerpt the main comparisons; the guide does not cover every appendix demonstration or additional experiment, and the experiments were not reproduced. The five-vote example, hypothetical Apple Remote voting scenario, and product-attribute scoring case are teaching examples created for the guide. The subsequent reading order is editorial advice. Reading this guide or opening the paper does not automatically mark the original paper as read.
