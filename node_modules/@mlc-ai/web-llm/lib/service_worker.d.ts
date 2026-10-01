import { ChatOptions, MLCEngineConfig } from "./config";
import { WorkerRequest, WorkerResponse } from "./message";
import { WebWorkerMLCEngineHandler, WebWorkerMLCEngine, ChatWorker } from "./web_worker";
/**
 * Worker handler that can be used in a ServiceWorker.
 *
 * Construct the handler during the service worker script's initial evaluation.
 * Registering it from an `activate` or `message` listener is too late: the
 * browser can restart an already-active worker without dispatching `activate`,
 * and service worker event listeners must be registered synchronously on startup.
 *
 * @example
 *
 * // sw.ts
 * import { ServiceWorkerMLCEngineHandler } from "@mlc-ai/web-llm";
 *
 * new ServiceWorkerMLCEngineHandler();
 */
export declare class ServiceWorkerMLCEngineHandler extends WebWorkerMLCEngineHandler {
    private clientRegistry;
    private initRequestUuid?;
    constructor();
    postMessage(message: WorkerResponse): void;
    onmessage(event: ExtendableMessageEvent, onComplete?: (value: any) => void, onError?: () => void): void;
}
export declare class ServiceWorker implements ChatWorker {
    _onmessage: (event: MessageEvent) => void;
    get onmessage(): (event: any) => void;
    set onmessage(handler: (event: any) => void);
    postMessage(message: WorkerRequest): void;
}
/**
 * Create a ServiceWorkerMLCEngine.
 *
 * @param modelId model_id of the model to load, either string or string[]. When multiple models
 *   are provided, we load all models sequentially. Each modelId needs to either be in
 *   `webllm.prebuiltAppConfig`, or in `engineCOnfig.appConfig`.
 * @param engineConfig Optionally configures the engine, see `webllm.MLCEngineConfig` for more.
 * @param chatOpts Extra options to optionally override the `mlc-chat-config.json` of `modelId`.
 *   The size of which needs to match that of `modelId`; chatOpts[i] will be used for modelId[i].
 * @returns An initialized `WebLLM.ServiceWorkerMLCEngine` with `modelId` loaded.
 */
export declare function CreateServiceWorkerMLCEngine(modelId: string | string[], engineConfig?: MLCEngineConfig, chatOpts?: ChatOptions | ChatOptions[], keepAliveMs?: number): Promise<ServiceWorkerMLCEngine>;
/**
 * A client of MLCEngine that exposes the same interface
 */
export declare class ServiceWorkerMLCEngine extends WebWorkerMLCEngine {
    missedHeartbeat: number;
    constructor(engineConfig?: MLCEngineConfig, keepAliveMs?: number);
    onmessage(event: any): void;
}
//# sourceMappingURL=service_worker.d.ts.map