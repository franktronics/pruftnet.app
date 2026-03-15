import { AnalyserCheck, CheckFunction } from '../types'

export class ValidityCheck implements AnalyserCheck {
    public check: CheckFunction = async (packet, analysedHostsStore, options) => {
        console.log(analysedHostsStore, options)
        return { action: 'continue' }
    }
}
