import binding from '../../loader.js'
import type { DateTimeInfo } from '../../types/datetime'

export class DateTime {
    static getInfo(): DateTimeInfo {
        return binding.datetime.getDateTimeInfo()
    }
}
