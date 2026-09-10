// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'contracts/anker_protocol/sources/product_note.move'), 'utf8');

describe('ProductNote contract indexer events', () => {
  it('exposes and emits the deployed V1 receipt events used by the dashboard indexer', () => {
    for (const eventName of ['ProductSubscribed', 'ProductRedeemed']) {
      expect(source).toContain(`public struct ${eventName} has copy, drop, store`);
      expect(source).toContain(`event::emit(${eventName} {`);
    }
  });

  it('keeps deployed V1 note creation permissionless for wallet-signed demo subscriptions', () => {
    expect(source).toMatch(/public fun new_dual_investment_note\(/);
    expect(source).not.toContain('MinterCap');
    expect(source).not.toContain('subscribe_dual_investment_note');
  });
});
