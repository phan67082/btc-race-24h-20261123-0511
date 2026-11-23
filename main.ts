// Dip-and-hold with a hard stop — one trade, then sit still.
//
// Why this shape wins on this competition's scoring, and why the busy
// alternatives lose: the score is a single number, net PnL over one 24h
// window of 1-minute cbBTC bars, starting from $1,000. A full-size
// round trip costs about 26 bps in fees (4), modelled slippage (2) and
// price impact (~7 bps a leg on this pool at $1,000 size), so every
// extra trade is a ~$2.60 toll paid before the market has moved at all.
// On the dev window the rally is front-loaded — most of the +3.6% drift
// lands in the first six hours — and 1-minute noise is only ~0.08%,
// so a bot that trades on every wiggle pays the toll dozens of times
// and bleeds out (EMA-cross lost $115–$125 over ~80 trades in the
// sweep; RSI and Donchian lost too), while a bot that simply buys and
// holds banks +$32. The winning move is therefore to be *in* the
// market for the rally, pay the toll exactly once, and otherwise do
// nothing.
//
// This bot does that with a small timing edge over plain buy-and-hold:
// it waits for the first 50 bps dip off the running high, which on a
// rising window buys a slightly cheaper entry than the open, then holds
// to the end. If the window rallies in a straight line with no dip at
// all, a fallback buy at batch 480 (8 hours in) makes sure the bot is
// not left in cash watching the rally go by. The only exit is a hard
// stop: if the price falls 1.5% below the entry close, sell everything
// and stay in cash for good — no re-entry. That stop is what makes the
// profile asymmetric: on both real dev windows it never fires, so the
// upside is kept whole, but on a reversed window (a -3.5% drift instead
// of +3.6%) it cuts the loss roughly in half, from about -$37 to about
// -$18. No trailing stop and no take-profit: both were measured and
// both cost money on the real windows — a trailing stop shaves $2–5 off
// the good window for nothing, and a take-profit sells the rally early,
// which is exactly the upside this shape exists to keep.
//
// Everything is integer math on bigints; no clock, no randomness, no
// file or network access, so two runs produce byte-identical action
// logs. Orders fill at the next bar's open; the harness flattens any
// open position at the final close.

import { runBars, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// Dip: buy when the close is at least 50 bps under the running high.
const DIP_BPS = 50n;
// Fallback: buy anyway once we reach this batch, so a straight-line
// rally without any dip still leaves us invested.
const FALLBACK_SEQ = 480;
// Hard stop: sell everything if the close falls 1.5% under the entry
// close. One-way only — after it fires we never buy again.
const STOP_BPS = 150n;
const BPS = 10_000n;
// Slippage allowance on every order, wide enough that a normal
// 1-minute move never rejects the fill, tight enough to refuse a wild
// gap open.
const MAX_SLIPPAGE_BPS = 200;

let runningHigh: bigint | null = null;
let entryClose: bigint | null = null;
let bought = false;
let stopped = false;

await runBars({
  onBatch(state) {
    // Warm-up batches reject every order, and a batch with no bar for
    // our symbol has no price to act on: answer nothing either way.
    if (state.warmingUp) return [];
    const close = state.close(SYMBOL);
    if (close === null) return [];

    const held = state.positions.get(SYMBOL)?.qty ?? 0n;

    // Exit first: if we hold and the price has fallen 1.5% under the
    // entry close, sell the whole position and stop trading forever.
    if (held > 0n && entryClose !== null && close * BPS <= entryClose * (BPS - STOP_BPS)) {
      stopped = true;
      const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held, max_slippage_bps: MAX_SLIPPAGE_BPS };
      return [sell];
    }

    // Entry: one buy, at the first 50 bps dip off the running high, or
    // at the fallback batch if no dip has shown up by then.
    if (!bought && !stopped && held === 0n) {
      const high = runningHigh ?? close;
      const dipped = close * BPS <= high * (BPS - DIP_BPS);
      if (dipped || state.seq >= FALLBACK_SEQ) {
        bought = true;
        entryClose = close;
        const buy: BuyInput = { side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS };
        return [buy];
      }
    }

    // Keep the running high current for the next batch. It is updated
    // after the dip check, so a bar is always measured against the high
    // set by earlier bars, never against itself.
    if (runningHigh === null || close > runningHigh) runningHigh = close;
    return [];
  },
});
