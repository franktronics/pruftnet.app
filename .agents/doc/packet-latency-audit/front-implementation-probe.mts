import { DatabaseSync } from 'node:sqlite'
import { mergeSummaryBatch, emptySummaryState } from '../../../packages/front/src/pages/capture/hooks/use-packet-summaries.ts'
import { filterPacketRows, emptyPacketDisplayFilters } from '../../../packages/front/src/pages/capture/model/packet-filters.ts'
import { packetViewport } from '../../../packages/front/src/pages/capture/model/packet-viewport.ts'
const db = new DatabaseSync(process.argv[2] ?? '.data/pruftnet/pruftnet.sqlite', {readOnly:true})
const id = db.prepare("select id from capture_sessions where state='stopped' order by cast(summary_count as integer) desc limit 1").get()!.id as string
const samples = db.prepare('select summary_json from capture_summaries where capture_id=? order by row_index limit 50000').all(id).map(r=>JSON.parse(r.summary_json as string)); db.close()
const state={...emptySummaryState,rows:samples.map(summary=>({kind:'packet' as const,summary})),cursor:samples.at(-1).cursor,originTimestampNs:samples[0].timestampNs,maximumTimestampNs:samples.at(-1).timestampNs}
const summaries=samples.slice(0,1024).map((s,i)=>({...s,cursor:String(50001+i)}))
const batch={captureId:id,summaries,firstCursor:'50001',lastCursor:'51024',oldestAvailableCursor:'1',newestAvailableCursor:'51024',gapBeforeFirst:false,captureComplete:false}
function bench(name:string,fn:()=>number){const times:number[]=[];let checksum=0;for(let i=0;i<210;i++){const t=performance.now();checksum+=fn();if(i>=10)times.push(performance.now()-t)}times.sort((a,b)=>a-b);console.log(JSON.stringify({name,median_ms:times[100],p95_ms:times[189],max_ms:times.at(-1),checksum}))}
bench('live_prepare_50000_plus_1024',()=>{const next=mergeSummaryBatch(id,state,batch);const visible=filterPacketRows(next.rows,emptyPacketDisplayFilters,next.originTimestampNs);return visible.length+Number(next.maximumTimestampNs!==undefined)+packetViewport(visible.length,680,0).items.length})
const filter={...emptyPacketDisplayFilters,search:'tcp'}
bench('unchanged_filter_50000',()=>filterPacketRows(state.rows,filter,state.originTimestampNs).length)
for(const count of [213741,1000000,10000000])bench(`viewport_${count}`,()=>packetViewport(count,680,4000000).items.length)
