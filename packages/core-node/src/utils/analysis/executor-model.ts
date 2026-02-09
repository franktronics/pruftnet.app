export abstract class ExecutorModel {
    abstract execute(returnCb: (result: any) => void): void
}
