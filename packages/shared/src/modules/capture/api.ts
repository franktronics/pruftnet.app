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
    CaptureStats,
    PacketSummaryBatch,
    ReadCaptureEventsRequest,
    ReadPacketSummariesRequest,
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
    Rpc.make('ReadCaptureEvents', {
        payload: ReadCaptureEventsRequest,
        success: CaptureEventBatch,
        error: CaptureRpcError,
    }),
) {}
