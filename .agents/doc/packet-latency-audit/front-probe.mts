import { DatabaseSync } from 'node:sqlite'
import { performance } from 'node:perf_hooks'
import { mergeSummaryBatch, readPacketSummaryState, emptySummaryState } from '../../../packages/front/src/pages/capture/hooks/use-packet-summaries.ts'
import { filterPacketRows, emptyPacketDisplayFilters, relativeSecondsNumber } from '../../../packages/front/src/pages/capture/model/packet-filters.ts'
const db = new DatabaseSync(process.argv[2] ?? '.data/pruftnet/pruftnet.sqlite', {readOnly:true})
const id = db.prepare("select id from capture_sessions where state='stopped' order by cast(summary_count as integer) desc limit 1").get()!.id as string
const samples = db.prepare('select summary_json from capture_summaries where capture_id=? order by row_index limit 50000').all(id).map(r=>JSON.parse(r.summary_json as string))
db.close()
const base = {...emptySummaryState, rows:samples.map(summary=>({kind:'packet' as const,summary})), cursor:samples.at(-1).cursor, originTimestampNs:samples[0].timestampNs}
function batch(start:number,count=1024) {
  const summaries=Array.from({length:count},(_,i)=>({...samples[i%samples.length],cursor:String(start+i),key:{captureId:id,packetId:String(start+i)}}))
  return {captureId:id,summaries,firstCursor:summaries[0]?.cursor??null,lastCursor:summaries.at(-1)?.cursor??null,oldestAvailableCursor:'1',newestAvailableCursor:'1000000',gapBeforeFirst:false,captureComplete:false}
}
const incoming=batch(50001)
function bench(name:string,fn:()=>number) {
  const times:number[]=[];let checksum=0
  for(let run=0;run<110;run++){const start=performance.now();checksum+=fn(); if(run>=10)times.push(performance.now()-start)}
  times.sort((a,b)=>a-b)
  console.log(JSON.stringify({name,median_ms:+times[50].toFixed(2),p95_ms:+times[94].toFixed(2),max_ms:+times.at(-1)!.toFixed(2),checksum}))
}
bench('merge_50000_plus_1024',()=>mergeSummaryBatch(id,base,incoming).rows.length)
bench('merge_filter_counts_max_time',()=>{
 const next=mergeSummaryBatch(id,base,incoming)
 const visible=filterPacketRows(next.rows,emptyPacketDisplayFilters,next.originTimestampNs)
 const count1=next.rows.filter(r=>r.kind==='packet').length
 const count2=next.rows.filter(r=>r.kind==='packet').length
 const count3=visible.filter(r=>r.kind==='packet').length
 const maximum=next.rows.reduce((max,r)=>r.kind==='gap'?max:Math.max(max,relativeSecondsNumber(r.summary.timestampNs,next.originTimestampNs!)),0)
 return count1+count2+count3+Math.trunc(maximum)
})
bench('filter_text_tcp_50000',()=>filterPacketRows(base.rows,{...emptyPacketDisplayFilters,search:'tcp'},base.originTimestampNs).length)
const controller=new AbortController();let calls=0;let settled=false
const pending=readPacketSummaryState(id,emptySummaryState,'live',async()=>{
  calls++
  if(calls===5) controller.abort()
  return batch((calls-1)*1024+1)
},controller.signal).then(()=>{settled=true},e=>{console.log(JSON.stringify({name:'full_batches_publication',calls,returned_state:settled,outcome:e.name}))})
await pending
