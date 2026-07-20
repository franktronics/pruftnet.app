import { Rpc, RpcGroup } from '@effect/rpc'
import { Schema } from 'effect'
import { CaptureRpcError } from './errors'
import {
    CaptureEventBatch,
    CaptureIdRequest,
    CaptureInterface,
    CaptureInterfaceCapabilities,
    CaptureInterfaceRequest,
    CaptureSession,
    CaptureRecord,
    CaptureRecordList,
    CreateExportRequest,
    ExportJob,
    ExportJobList,
    ListCaptureStatSamplesRequest,
    OpenCaptureResult,
    CaptureStats,
    CaptureStatSampleList,
    PacketSummaryBatch,
    PacketSummaryManifest,
    PacketSummaryManifestRequest,
    PacketSummaryRange,
    ReadCaptureEventsRequest,
    ReadPacketSummariesRequest,
    ReadPacketSummaryRangeRequest,
    RegistryRevisionRequest,
    RegistrySnapshot,
    StartCaptureRequest,
} from './schema'

export class CaptureRpcs extends RpcGroup.make(
    Rpc.make('ListCaptureInterfaces', {
        success: Schema.Array(CaptureInterface),
        error: CaptureRpcError,
    }),
    Rpc.make('GetCaptureInterfaceCapabilities', {
        payload: CaptureInterfaceRequest,
        success: CaptureInterfaceCapabilities,
        error: CaptureRpcError,
    }),
    Rpc.make('StartCapture', {
        payload: StartCaptureRequest,
        success: CaptureSession,
        error: CaptureRpcError,
    }),
    Rpc.make('StopCapture', {
        payload: CaptureIdRequest,
        success: CaptureSession,
        error: CaptureRpcError,
    }),
    Rpc.make('GetCaptureSession', {
        payload: CaptureIdRequest,
        success: CaptureSession,
        error: CaptureRpcError,
    }),
    Rpc.make('ReadPacketSummaries', {
        payload: ReadPacketSummariesRequest,
        success: PacketSummaryBatch,
        error: CaptureRpcError,
    }),
    Rpc.make('GetPacketSummaryManifest', {
        payload: PacketSummaryManifestRequest,
        success: PacketSummaryManifest,
        error: CaptureRpcError,
    }),
    Rpc.make('ReadPacketSummaryRange', {
        payload: ReadPacketSummaryRangeRequest,
        success: PacketSummaryRange,
        error: CaptureRpcError,
    }),
    Rpc.make('GetRegistrySnapshot', {
        payload: RegistryRevisionRequest,
        success: RegistrySnapshot,
        error: CaptureRpcError,
    }),
    Rpc.make('GetCaptureStats', {
        payload: CaptureIdRequest,
        success: CaptureStats,
        error: CaptureRpcError,
    }),
    Rpc.make('ListCaptureStatSamples', {
        payload: ListCaptureStatSamplesRequest,
        success: CaptureStatSampleList,
        error: CaptureRpcError,
    }),
    Rpc.make('ReadCaptureEvents', {
        payload: ReadCaptureEventsRequest,
        success: CaptureEventBatch,
        error: CaptureRpcError,
    }),
    Rpc.make('ListCaptures', {
        success: CaptureRecordList,
        error: CaptureRpcError,
    }),
    Rpc.make('GetCapture', {
        payload: CaptureIdRequest,
        success: CaptureRecord,
        error: CaptureRpcError,
    }),
    Rpc.make('GetActiveCapture', {
        success: Schema.NullOr(CaptureRecord),
        error: CaptureRpcError,
    }),
    Rpc.make('OpenCapture', {
        payload: CaptureIdRequest,
        success: OpenCaptureResult,
        error: CaptureRpcError,
    }),
    Rpc.make('DeleteCapture', {
        payload: CaptureIdRequest,
        success: CaptureRecord,
        error: CaptureRpcError,
    }),
    Rpc.make('CreateExport', {
        payload: CreateExportRequest,
        success: ExportJob,
        error: CaptureRpcError,
    }),
    Rpc.make('ListExportJobs', {
        success: ExportJobList,
        error: CaptureRpcError,
    }),
) {}
