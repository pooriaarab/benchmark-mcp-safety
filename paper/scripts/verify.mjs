import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {benchmark,score} from '../../dist/index.js';
import {wilson,bootstrap,mean} from '../template/stats.mjs';
const read=async p=>JSON.parse(await readFile(`paper/${p}`)), hash=x=>createHash('sha256').update(x).digest('hex');
const runs=await read('data/runs.generated.json'), repeats=await read('data/repeat.generated.json'), summary=await read('data/summary.generated.json'), sim=await read('data/simulation.generated.json'), meta=await read('meta.json'), provenance=await read('data/provenance.generated.json');
const tasks=await benchmark.listTasks(), semantic=r=>r.rows.map(({taskId,submission,episode,score,reason})=>({taskId,submission,episode,score,reason}));
for(const [p,digest] of Object.entries(provenance.files)) assert.equal(hash(await readFile(p)),digest,`Provenance mismatch: ${p}`);
for(const r of runs) {
  const repeat=repeats.find(x=>x.policy===r.policy); assert.equal(hash(JSON.stringify(semantic(r.report))),repeat.sha256); assert.equal(repeat.sha256,hash(JSON.stringify(semantic(repeat.report))));
  const stats=summary.baselineStats.find(x=>x.policy===r.policy);
  for(const row of r.report.rows) {const result=await score(row.taskId,row.submission);assert.equal(result.score,row.score);assert.equal(result.reason,row.reason);}
  for(const stratum of stats.strata) for(const [key,label] of [['s','safetyScore'],['u','usefulnessScore'],['j',null]]) {const rows=r.report.rows.filter((x,i)=>tasks[i].metadata.variant===stratum.variant); const k=rows.reduce((n,x)=>n+(label?+x.reason.match(new RegExp(`${label}=(\\d)`))[1]:x.score),0);assert.deepEqual(stratum[key],wilson(k,rows.length));}
}
for(const [id,t] of Object.entries(sim.traces)) {assert.equal(hash(JSON.stringify(t)),id);const result=await score(t.taskId,t.submission);assert.equal(result.score,t.score);assert.equal(result.reason,t.reason);assert.deepEqual(t.submission.toolLog,t.episode.toolLog);}
for(const a of sim.population) for(const r of a.rows) {const t=sim.traces[r.trace];assert.equal(t.taskId,r.taskId);assert.equal(r.j,t.score);assert.equal(r.s,+t.reason.match(/safetyScore=(\d)/)[1]);assert.equal(r.u,+t.reason.match(/usefulnessScore=(\d)/)[1]);}
for(const cell of summary.simStats) for(const stratum of cell.strata) for(const key of ['s','u','j']) {const agents=sim.population.filter(a=>a.p===cell.p&&a.layer===cell.layer);const values=agents.map(a=>mean(a.rows.filter(r=>r.taskId.endsWith(stratum.variant)).map(r=>r[key])));assert.deepEqual(stratum[key],bootstrap([values],g=>mean(g[0])));}
assert.ok(meta.abstract.length<=1920&&/^[\x00-\x7f]*$/.test(meta.abstract));assert.equal(meta.license,'CC-BY-4.0');assert.ok((await readFile('CITATION.cff','utf8')).includes(meta.title));
const text=execFileSync('pdftotext',['paper/'+meta.artifact_name,'-'],{encoding:'utf8'}), info=execFileSync('pdfinfo',['paper/'+meta.artifact_name],{encoding:'utf8'}), pages=+info.match(/Pages:\s+(\d+)/)[1];
assert.ok(pages>=8,`Only ${pages} pages`);assert.ok(!text.includes('—'));assert.ok(!/undefined (references|citations)|Overfull \\hbox/.test(await readFile('paper/paper.log','utf8')));
const artifact={pages,baselineEpisodes:summary.baselineEpisodes,simulatedEpisodes:summary.simulatedEpisodes,replayedUniqueTraces:Object.keys(sim.traces).length,baselineRepeatsAgree:true,rawSummaryAgreement:true,asciiAbstract:true,pdfSha256:hash(await readFile('paper/'+meta.artifact_name)),sourceCommit:provenance.source_commit,preregCommit:provenance.prereg_commit,figures:(await readdir('paper/figures')).length};
await writeFile('paper/data/verification.generated.json',JSON.stringify(artifact,null,2)+'\n');console.log(JSON.stringify(artifact));
