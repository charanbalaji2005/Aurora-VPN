import {QuotaState, isExhausted, remainingFraction} from '../src/domain/models';

const quota = (patch: Partial<QuotaState>): QuotaState => ({
  dailySeconds: 10_800,
  usedSeconds: 0,
  remainingSeconds: 10_800,
  resetsAtIso: null,
  unlimited: false,
  ...patch,
});

describe('quota display maths', () => {
  it('drives the ring from the remaining fraction', () => {
    expect(remainingFraction(quota({usedSeconds: 5_400, remainingSeconds: 5_400}))).toBeCloseTo(0.5);
  });

  it('never reports more than full or less than empty', () => {
    expect(remainingFraction(quota({remainingSeconds: 99_999}))).toBe(1);
    expect(remainingFraction(quota({remainingSeconds: -60}))).toBe(0);
  });

  it('only counts as exhausted when the plan is metered', () => {
    expect(isExhausted(quota({remainingSeconds: 0}))).toBe(true);
    expect(isExhausted(quota({remainingSeconds: 0, unlimited: true}))).toBe(false);
  });
});
