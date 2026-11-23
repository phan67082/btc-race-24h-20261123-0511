# Dip-and-Hold cbBTC — btc-race-24h-20261123-0511

Bot giao dịch Coinbase Wrapped BTC (CBBTC) trên cửa sổ 24 giờ, bar 1 phút,
vốn $1.000 USDC. Chiến lược: **mua một lần rồi giữ**, chỉ thoát bằng hard stop.

## Chiến lược

1. **Entry — dip 50 bps:** theo dõi running high (close cao nhất từ đầu cửa sổ).
   Mua 100% cash khi close <= running high × 0,995.
2. **Fallback — batch 480:** nếu tới batch 480 (8 giờ) vẫn chưa có dip nào
   (cửa sổ rally thẳng), mua 100% cash để không đứng ngoài rally.
3. **Exit — hard stop −1,5%:** nếu close <= giá vào × 0,985 thì bán toàn bộ
   và **không re-entry**, giữ cash tới cuối cửa sổ.
4. Còn lại hold tới cuối — harness tự flatten ở close cuối cùng.

Không trailing stop, không take-profit: cả hai đều đã được đo và đều tốn tiền
trên cửa sổ dev thật (trailing stop bào $2–5, take-profit tự cắt upside của rally).

## Vì sao hình dạng này thắng theo scoring

- **Metric duy nhất là net PnL** trên cửa sổ race 24h; dev gate yêu cầu PnL dev > $0;
  guardrail: tối thiểu 1 trade, max drawdown ≤ 25%; tie-break: ít trade hơn thắng.
- **Chi phí là kẻ thù số một:** một round-trip full-size tốn ~26 bps
  (phí 4 + trượt 2 + impact ~7 bps mỗi chiều). Mỗi trade thêm là ~$2,60 nộp
  trước khi thị trường kịp đi đâu.
- **Dev window mới drift +3,64%** (mở $58.956,59 → đóng $61.102,18), rally tập
  trung 6 giờ đầu (+3,20%), sau đó đi ngang; vol 1 phút σ ≈ 0,081%.
  Trong cửa sổ đó, exposure trong rally quan trọng hơn mọi tín hiệu vào/ra.

## Kết quả sweep (fast backtest, đã khớp số harness cho buy-hold +$32,17)

| Chiến lược | Net PnL dev mới | Trades | Ghi chú |
| --- | --- | --- | --- |
| Dip 0,5% rồi hold (+ stop −1,5%) | **+$36,96** | 2 (1 mua + flatten) | Bot này |
| Buy-and-hold | +$32,17 | 1 | Baseline nhà |
| Momentum (baseline nhà) | +$34,94 | 1 | |
| EMA-cross 8/21 | −$124,50 | 80 | Chảy máu vì phí |
| RSI | −$25 … −$57 | nhiều | |
| Donchian 24 | −$67,02 | nhiều | |
| Hold-cash | $0 | 0 | Rớt dev gate |

House baselines (grade-local, số harness thật): buy-and-hold +$32,17 (DD 1,98%),
momentum +$34,94, ema-cross −$114,83 (76 trades, DD 11,6%), hold-cash $0.

## Robustness cross-window

Dip-hold thắng trên cả 2 cửa sổ dev thật (+$37,0 mới, +$2,3 cũ 17/11).
Trên 2 cửa sổ đảo ngược (drift −3,5%): không stop lỗ −$37,2; **có hard stop
−1,5% không re-entry chỉ lỗ −$18,1**, trong khi giữ nguyên +$37,0 / +$2,3
trên 2 dev thật. Đó là profile bất đối xứng mà bot này nhắm tới: giữ trọn
upside khi rally, mất ít khi crash.

## Kết quả dev grade của bot này (grade-local, process driver)

Chạy 2 lần độc lập, kết quả giống hệt nhau (determinism):

- **Net PnL: +$36,961738** (return +3,6961738%) — khớp backtest +$36,96
- **Trades: 1** (chỉ lệnh mua dip; flatten cuối không tính), win rate 1,0
- **Max drawdown: 1,9778%** (guardrail ≤ 25% — còn xa)
- Exposure 97,57%, phí $0,814951, 0 lệnh bị reject
- **Guardrails: met** (trades ok, symbols ok, drawdown ok) — **qua dev gate
  (PnL > $0), đủ điều kiện race**
- `action_log_sha256`: `deaff0242370b9b84ac591876d45deccb0c7ad5022d7bbb4264e9af1153ba57a`
- `result_sha256`: `3feb2978bd03317dd74bbabf84330c34fe58804a465b448df8a8a7c21a666cb1`
  (giống hệt cả 2 lần chạy; L1 regrade reproduced byte for byte)
- So với buy-and-hold (+$32,17): **hơn +$4,79** nhờ mua dip thay vì mua ngay
  ở mở cửa; so với momentum (+$34,94): hơn +$2,02.
- Lưu ý: `result_sha256` local không bằng server (máy này node v24.22.1,
  server chạy harness node v26.13.1; process driver không ghi image digest).
  Số PnL/trades/DD là số harness thật, không phụ thuộc phiên bản node.

## Verify

```sh
node <kit>/cli/makefun.mjs grade-local --kit <kit> --bot <entry> --driver process
node <kit>/cli/makefun.mjs grade-local --kit <kit> --bot <entry> --driver process  # lần 2: determinism
makefun check --kit <kit> --repo <entry>
```

## Cấu trúc

- `main.ts` — bot, viết tay hoàn toàn (Node 22, erasable TS, chỉ dùng SDK + stdlib).
- `vendor/makefun-bars.ts` — copy byte-identical từ kit SDK (không sửa).
