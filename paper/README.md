# MCP Safety paper

This paper measures safe completion across tool trust boundaries. It reports scripted controls and a clearly labelled simulated population. It contains no learned-model results.

From the repository root, with Node 22, npm 10, Python 3, Tectonic, and Poppler installed:

```sh
npm ci
sh paper/template/reproduce.sh
```

The output is `paper/mcp-safety-paper.pdf`. The PDF and downloaded style remain untracked. The shared `template/` is copied unchanged from the accepted honesty pilot. All study prose, scripts, figures, and metrics are specific to MCP Safety.

The repeat command builds the package, executes the study, renders tables, builds the PDF, and verifies recorded outcomes through replay. It also compares baseline repeats and recomputes summary intervals. The template pins the official NeurIPS style archive hash. The first build can download TeX dependencies. Experiments use local scripts with no model credentials or provider requests.

`PREREG.md` is committed before collection. This is a local study plan, not external registration. `config.json` freezes the benchmark source commit. `data/provenance.generated.json` records source hashes and the plan commit. The run halts if the frozen inputs change.

`data/runs.generated.json` and `repeat.generated.json` contain actual baseline reports and transcripts. `simulation.generated.json` stores simulated agents and content-addressed executed traces. Each trace retains the proposed calls before filtering. `summary.generated.json` contains all grid cells and intervals. `diagnostics.generated.json` contains endpoint intervals and trace counts. `verification.generated.json` records replay checks and the PDF hash. Generated files must be rebuilt, not edited.

Wilson intervals describe unique tasks within each variant, or matched pairs. Simulated bootstrap intervals resample agents on fixed tasks. Deterministic endpoint intervals collapse. The endpoint table therefore also reports Wilson intervals over unique tasks. Simulated filters use privileged labels and remove calls without replanning. Their scores do not establish deployment safety.

The family paper informs terminology and the earlier audit context. The current study does not reuse its metrics or outcomes. The PayBench project page informs the construct-first structure; its PDF could not be retrieved. References were checked against primary pages on 2026-10-29.

Paper text and generated figures: CC-BY-4.0. Software and original tasks retain MIT licensing. Do not publish or merge automatically. The parent handles release review.

The local gate passes with Node 22 and npm 10, matching CI. An initial npm 12 run fails because its pack JSON changes shape. No benchmark code changes address that separate compatibility issue.
