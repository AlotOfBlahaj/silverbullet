import { safeRun } from "../util.ts";

// @ts-ignore
// import workerCode from "bundle-text:./node_worker.ts";
import { Sandbox } from "../sandbox.ts";
import { WorkerLike } from "./worker.ts";
import { Plug } from "../plug.ts";

class DenoWorkerWrapper implements WorkerLike {
  private worker: Worker;
  onMessage?: (message: any) => Promise<void>;
  ready: Promise<void>;

  constructor(worker: Worker) {
    this.worker = worker;
    this.worker.addEventListener("message", (evt: any) => {
      let data = evt.data;
      if (!data) return;
      safeRun(async () => {
        await this.onMessage!(data);
      });
    });
    this.ready = Promise.resolve();
  }
  postMessage(message: any): void {
    this.worker.postMessage(message);
  }

  terminate() {
    return this.worker.terminate();
  }
}

export function createSandbox(plug: Plug<any>) {
  let worker = new Worker(
    new URL("./sandbox_worker.ts", import.meta.url).href,
    {
      type: "module",
    }
  );
  return new Sandbox(plug, new DenoWorkerWrapper(worker));
}
