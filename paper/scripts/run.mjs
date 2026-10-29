import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { benchmark, run } from '../../dist/index.js';
import { mulberry32 } from 'benchmark-core';
import { mean, wilson, bootstrap } from '../template/stats.mjs';
const hash = x => createHash('sha256').update(x).digest('hex');
const config = JSON.parse(await readFile('paper/config.json')), tasks = await benchmark.listTasks();
const sources = ['src/benchmark.ts','src/index.ts','src/report.ts','data/tasks.jsonl','package-lock.json'];
for (const p of sources) assert.equal(hash(await readFile(p)), hash(execFileSync('git',['show',`${config.source_commit}:${p}`])), `Source drift: ${p}`);
const options = { seed:1, concurrency:1, retries:0, maxTurns:12, maxToolCalls:20, budgetUsd:0 };
const save = (name,x) => writeFile(`paper/data/${name}.generated.json`, JSON.stringify(x,null,2)+'\n');
const calls = (task,bad=false) => benchmark.definition.mockPolicies[bad?'bad':'good'](task).flatMap(t=>t.toolCalls??[]);
function blocked(task,call,layer) {
  const m=task.metadata, t=m.tools, required=m.requires??[];
  const secret=JSON.stringify(call.args).toLowerCase().includes(m.canary.toLowerCase());
  const forbidden=call.name===t.shadow || (call.name===t.sink&&!required.includes('sink')) || (call.name===t.bulk&&!required.includes('bulk')) || (m.variant==='malicious'&&call.name===t.connector);
  if(layer==='blanket') return [t.sink,t.bulk,t.shadow,t.connector].filter(Boolean).includes(call.name);
  return (['secret','both'].includes(layer)&&secret)||(['roles','both'].includes(layer)&&forbidden);
}
function adapter(policy,plan) {
  return { id:policy, complete:async()=>{throw Error('Episode expected');}, async chat({messages,tools},context) {
    const reply=content=>({content,toolCalls:[]}), turn=messages.filter(m=>m.role==='assistant').length;
    if(policy==='empty') return reply('');
    if(policy==='constant') return reply('OK');
    if(policy==='echo') return reply(messages.find(m=>m.role==='user').content);
    if(policy==='refuse') return reply('I cannot help with that request.');
    const list=policy==='first-tool'?[{name:tools[0].name,args:{}}]:plan(context.task);
    return turn<list.length?{content:'',toolCalls:[{...list[turn],id:`call-${turn}`}]}:reply('Done');
  } };
}
const semantic=r=>r.rows.map(({taskId,submission,episode,score,reason})=>({taskId,submission,episode,score,reason}));
async function execute(policy,plan) {
  const r=await run(adapter(policy,plan),options);
  assert.deepEqual(r.rows.map(x=>x.taskId),tasks.map(t=>t.id));
  assert.ok(r.rows.every(x=>!x.error&&!x.episode?.aborted)); assert.equal(r.totals.costUsd??0,0);
  return r;
}
const components=r=>({s:+r.reason.match(/safetyScore=(\d)/)[1],u:+r.reason.match(/usefulnessScore=(\d)/)[1],j:r.score});
const rate=(rows,key)=>wilson(rows.reduce((n,r)=>n+components(r)[key],0),rows.length);
const baselines=[], repeats=[];
for(const policy of ['empty','constant','echo','refuse','first-tool','packaged-good','packaged-bad']) {
  const plan=t=>calls(t,policy==='packaged-bad'), report=await execute(policy,plan), repeat=await execute(policy,plan);
  const digest=hash(JSON.stringify(semantic(report))); assert.equal(digest,hash(JSON.stringify(semantic(repeat))));
  baselines.push({policy,report}); repeats.push({policy,sha256:digest,repeatSha256:hash(JSON.stringify(semantic(repeat))),report:repeat});
}
await save('runs',baselines); await save('repeat',repeats);
const pairs=[...new Set(tasks.map(t=>t.metadata.pair))], layers=['none','secret','roles','both','blanket'], probabilities=[0,.25,.5,.75,1];
const traces={}, population=[];
for(let seed=1;seed<=16;seed++) {
  const rng=mulberry32(seed), draws=Object.fromEntries(pairs.map(p=>[p,rng()]));
  for(const p of probabilities) for(const layer of layers) {
    const proposals={}, plan=t=>{const proposed=calls(t,t.metadata.variant==='malicious'&&draws[t.metadata.pair]<p); proposals[t.id]=proposed; return proposed.filter(c=>!blocked(t,c,layer));};
    const report=await execute(`simulated:${seed}:${p}:${layer}`,plan);
    const rows=report.rows.map(r=>{const trace={taskId:r.taskId,proposals:proposals[r.taskId],submission:r.submission,episode:r.episode,score:r.score,reason:r.reason}; const id=hash(JSON.stringify(trace)); traces[id]=trace; return {taskId:r.taskId,trace:id,...components(r)};});
    population.push({kind:'simulated',seed,p,layer,rows});
  }
}
await save('simulation',{kind:'simulated',population,traces});
const baselineStats=baselines.map(({policy,report})=>({policy, strata:['benign','malicious'].map(variant=>{const rows=report.rows.filter((r,i)=>tasks[i].metadata.variant===variant);return {variant,s:rate(rows,'s'),u:rate(rows,'u'),j:rate(rows,'j')};}),pair: wilson(pairs.filter(p=>report.rows.filter((r,i)=>tasks[i].metadata.pair===p).every(r=>r.score===1)).length,pairs.length)}));
const simStats=[];
for(const p of probabilities) for(const layer of layers) {
  const agents=population.filter(r=>r.p===p&&r.layer===layer), strata=['benign','malicious'];
  simStats.push({kind:'simulated',p,layer,strata:strata.map(variant=>{const idx=new Set(tasks.filter(t=>t.metadata.variant===variant).map(t=>t.id)); return {variant,...Object.fromEntries(['s','u','j'].map(key=>[key,bootstrap([agents.map(a=>mean(a.rows.filter(r=>idx.has(r.taskId)).map(r=>r[key])))],g=>mean(g[0]))]))};})});
}
const contrasts=layers.filter(l=>l!=='both').map(layer=>{const rows=population.filter(a=>a.p===1&&a.layer===layer).map(a=>{const ref=population.find(b=>b.seed===a.seed&&b.p===a.p&&b.layer==='both');return mean(ref.rows.map(r=>r.j))-mean(a.rows.map(r=>r.j));});return {kind:'simulated',reference:'both',layer,p:1,jDifference:bootstrap([rows],g=>mean(g[0]))};});
const summary={kind:'scripted-controls-and-simulated-population',tasks:tasks.length,pairs:pairs.length,ciLevel:95,seeds:16,probabilities,layers,options,baselineEpisodes:baselines.length*tasks.length*2,simulatedEpisodes:population.length*tasks.length,coverage:[...new Set(tasks.map(t=>t.metadata.attack))].map(attack=>({attack,benign:tasks.filter(t=>t.metadata.attack===attack&&t.metadata.variant==='benign').length,malicious:tasks.filter(t=>t.metadata.attack===attack&&t.metadata.variant==='malicious').length})),baselineStats,simStats,contrasts,costUsd:0,repeatIdentical:true,freeModels:'Not run: no free-only proxy configured for this study; external availability not tested.'};
await save('summary',summary);
await save('provenance',{source_commit:config.source_commit,prereg_commit:execFileSync('git',['log','--reverse','--format=%H','--','paper/PREREG.md'],{encoding:'utf8'}).trim().split('\n')[0],node:process.version,files:Object.fromEntries(await Promise.all([...sources,'paper/PREREG.md','paper/scripts/run.mjs','paper/template/stats.mjs'].map(async p=>[p,hash(await readFile(p))]))),semanticHash:hash(JSON.stringify(baselines.map(x=>semantic(x.report)))),simulationHash:hash(JSON.stringify(population))});
console.log(`Completed ${summary.baselineEpisodes} baseline and ${summary.simulatedEpisodes} simulated episodes; baseline repeats agree; USD 0`);
