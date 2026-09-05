import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
const db = new DatabaseSync(process.argv[2] ?? '.data/pruftnet/pruftnet.sqlite', {readOnly:true});
const capture = db.prepare("select id, summary_count from capture_sessions where state='stopped' order by cast(summary_count as integer) desc limit 1").get();
const id = capture.id;
const cases = [
  ['page_first', 'select summary_json from capture_summaries where capture_id=? and row_index>=? order by row_index limit 1024', [id,0]],
  ['page_middle', 'select summary_json from capture_summaries where capture_id=? and row_index>=? order by row_index limit 1024', [id,106496]],
  ['page_last', 'select summary_json from capture_summaries where capture_id=? and row_index>=? order by row_index limit 1024', [id,212992]],
  ['live_first_fallback', 'select summary_json from capture_summaries where capture_id=? and (length(cursor)>length(?) or (length(cursor)=length(?) and cursor>?)) order by length(cursor),cursor limit 1024', [id,'0','0','0']],
  ['filter_tcp', "select row_index from capture_summaries where capture_id=? and exists (select 1 from json_each(summary_json,'$.columns') as summary_column where instr(lower(cast(json_extract(summary_column.value,'$.value') as text)),?)>0) order by row_index", [id,'tcp']],
  ['filter_dns', "select row_index from capture_summaries where capture_id=? and exists (select 1 from json_each(summary_json,'$.columns') as summary_column where instr(lower(cast(json_extract(summary_column.value,'$.value') as text)),?)>0) order by row_index", [id,'dns']],
];
console.log(JSON.stringify({node:process.version, platform:process.platform, arch:process.arch, rows:capture.summary_count}));
for(const [name,sql,args] of cases) {
  const statement=db.prepare(sql);
  const times=[]; let count=0; let bytes=0;
  for(let run=0;run<6;run++) {
    const start=performance.now();const rows=statement.all(...args);
    times.push(performance.now()-start);count=rows.length;
    if(run===0 && rows[0]?.summary_json) bytes=rows.reduce((n,r)=>n+Buffer.byteLength(r.summary_json),0);
  }
  const warm=times.slice(1).sort((a,b)=>a-b);
  console.log(JSON.stringify({name,count,bytes,first_ms:+times[0].toFixed(2),warm_median_ms:+warm[2].toFixed(2),warm_max_ms:+warm[4].toFixed(2),plan:db.prepare('explain query plan '+sql).all(...args).map(r=>r.detail)}));
}
db.close();
