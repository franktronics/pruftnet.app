import { QUEUE_CAPACITY, WINDOW, createSimulation, ledger, step } from './capture-stats'

describe('capture statistics simulation', () => {
    it('keeps every conservation equation balanced through an overload', () => {
        const simulation = createSimulation(7, 0)
        const balanced = () =>
            ledger(simulation).conservation.every((equation) => equation.left === equation.right)
        expect(balanced()).toBe(true)

        simulation.overload = true
        for (let tick = 0; tick < 20; tick += 1) {
            step(simulation)
            expect(balanced()).toBe(true)
        }
        expect(simulation.totals.queueFull).toBeGreaterThan(0)
        expect(simulation.totals.depth).toBeLessThanOrEqual(QUEUE_CAPACITY)
        expect(ledger(simulation).status.tone).toBe('warning')

        simulation.overload = false
        for (let tick = 0; tick < 40; tick += 1) step(simulation)
        expect(balanced()).toBe(true)
        expect(simulation.totals.depth).toBe(0)
        expect(simulation.totals.backlog).toBe(0)
    })

    it('drops only the excess of a short burst over the writer rate', () => {
        const simulation = createSimulation(3, 0)
        const before = { ...simulation.totals }
        simulation.overload = true
        for (let tick = 0; tick < 8; tick += 1) step(simulation)
        const offered = simulation.totals.observed - before.observed
        const dropped = simulation.totals.queueFull - before.queueFull
        expect(dropped / offered).toBeGreaterThan(0.1)
        expect(dropped / offered).toBeLessThan(0.3)
        expect(ledger(simulation).lossShare).toBeLessThan(5)
    })

    it('holds a full chart window', () => {
        const simulation = createSimulation(1, 60_000)
        expect(simulation.samples).toHaveLength(WINDOW)
        step(simulation)
        expect(simulation.samples).toHaveLength(WINDOW)
    })
})
