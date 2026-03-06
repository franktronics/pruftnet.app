import { type CustomErrorType, ErrorType } from '../trpc-types'

/*
 * ClientError class to parse and handle errors received from the server.
 * It extracts relevant information such as origin, code, whatToDo, and additional data.
 * Use it only in the client-side code(browser or desktop).
 */
export class ClientError extends Error {
    constructor(props: CustomErrorType) {
        super(props.message)
        this.name = 'ClientError:' + props.type
        this.cause = { ...props, type: props.type || ErrorType.GENERIC_ERROR }
    }

    public getErrorData(): CustomErrorType {
        return this.cause as CustomErrorType
    }

    get type(): ErrorType {
        const cause = this.cause as CustomErrorType
        return cause.type || ErrorType.GENERIC_ERROR
    }

    get origin(): string | undefined {
        const cause = this.cause as CustomErrorType
        return cause?.origin
    }

    get code(): number {
        const cause = this.cause as CustomErrorType
        return cause.code
    }

    get whatToDo(): string | undefined {
        const cause = this.cause as CustomErrorType
        return cause?.whatToDo
    }

    get data(): any {
        const cause = this.cause as CustomErrorType
        return cause?.data
    }
}
