module anker_protocol::product_note;

use account::account::{Self, AccountWrapper};
use sui::{
    accumulator::AccumulatorRoot,
    clock::Clock,
    coin::Coin,
    event,
    transfer,
};

// === Constants ===

const PRODUCT_DUAL_INVESTMENT: u8 = 0;
const PRODUCT_SHARK_FIN: u8 = 1;
const STATUS_OPEN: u8 = 0;
const STATUS_REDEEMED: u8 = 1;
const MAX_FEE_BPS: u64 = 10_000;

// === Errors ===

const EFeeTooHigh: u64 = 0;
const EInvalidLegVectors: u64 = 1;
const ENotOwner: u64 = 2;
const EAlreadyRedeemed: u64 = 3;
const EBalanceDecreased: u64 = 4;
const EInsufficientCoupon: u64 = 5;

// === Structs ===

public struct PRODUCT_NOTE has drop {}

public struct AdminCap has key, store {
    id: UID,
}

public struct Registry has key {
    id: UID,
    fee_bps: u64,
    fee_recipient: address,
}

public struct ProductNote has key, store {
    id: UID,
    owner: address,
    product_kind: u8,
    product_id: vector<u8>,
    wrapper_id: ID,
    oracle_id: ID,
    expiry_ms: u64,
    principal_amount: u64,
    reserve_amount: u64,
    coupon_amount: u64,
    target_price: u64,
    floor_price: u64,
    lower_bound: u64,
    upper_bound: u64,
    is_bullish: bool,
    uses_mock_current_deposit: bool,
    apr_bps: u64,
    fee_bps: u64,
    strikes: vector<u64>,
    quantities: vector<u64>,
    costs: vector<u64>,
    order_ids: vector<u256>,
    status: u8,
    redeemed_payout_amount: u64,
    redeemed_fee_amount: u64,
}

// === Events ===

public struct FeePolicyUpdated has copy, drop, store {
    registry_id: ID,
    fee_bps: u64,
    fee_recipient: address,
}

public struct ProductSubscribed has copy, drop, store {
    registry_id: ID,
    note_id: ID,
    owner: address,
    product_kind: u8,
    wrapper_id: ID,
    oracle_id: ID,
    expiry_ms: u64,
    principal_amount: u64,
    fee_bps: u64,
    leg_count: u64,
    order_ids: vector<u256>,
}

public struct ProductRedeemed has copy, drop, store {
    registry_id: ID,
    note_id: ID,
    owner: address,
    product_kind: u8,
    wrapper_id: ID,
    oracle_id: ID,
    payout_amount: u64,
    fee_amount: u64,
}

// === Init ===

fun init(_: PRODUCT_NOTE, ctx: &mut TxContext) {
    let registry = Registry {
        id: object::new(ctx),
        fee_bps: 1_000,
        fee_recipient: ctx.sender(),
    };
    let cap = AdminCap { id: object::new(ctx) };

    transfer::share_object(registry);
    transfer::public_transfer(cap, ctx.sender());
}

// === Public Functions ===

public fun set_fee_policy(registry: &mut Registry, _: &AdminCap, fee_bps: u64, fee_recipient: address) {
    assert!(fee_bps <= MAX_FEE_BPS, EFeeTooHigh);
    registry.fee_bps = fee_bps;
    registry.fee_recipient = fee_recipient;

    event::emit(FeePolicyUpdated {
        registry_id: object::id(registry),
        fee_bps,
        fee_recipient,
    });
}

public fun new_dual_investment_note(
    registry: &Registry,
    product_id: vector<u8>,
    wrapper_id: ID,
    oracle_id: ID,
    expiry_ms: u64,
    principal_amount: u64,
    reserve_amount: u64,
    coupon_amount: u64,
    target_price: u64,
    floor_price: u64,
    apr_bps: u64,
    strikes: vector<u64>,
    quantities: vector<u64>,
    costs: vector<u64>,
    order_ids: vector<u256>,
    ctx: &mut TxContext,
): ProductNote {
    assert_leg_vectors(&strikes, &quantities, &costs, &order_ids);
    new_note(
        registry,
        product_id,
        PRODUCT_DUAL_INVESTMENT,
        wrapper_id,
        oracle_id,
        expiry_ms,
        principal_amount,
        reserve_amount,
        coupon_amount,
        target_price,
        floor_price,
        0,
        0,
        false,
        false,
        apr_bps,
        strikes,
        quantities,
        costs,
        order_ids,
        ctx,
    )
}

/// Same as `new_dual_investment_note`, except `coupon_amount` is derived on-chain
/// from `balance_before`/`balance_after` (the wrapper's own `wrapper_balance` reads,
/// taken immediately before the subscribe deposit and immediately after the last
/// leg mint in the same PTB) instead of trusting a client-supplied estimate. Ties
/// the note's guaranteed payout to what minting actually consumed, so a claim can
/// never be asked to withdraw more than the account actually holds for this note.
/// Kept as a separate function (rather than changing `new_dual_investment_note`'s
/// signature in place) so upgrades stay compatible with notes minted before this.
public fun new_dual_investment_note_verified(
    registry: &Registry,
    product_id: vector<u8>,
    wrapper_id: ID,
    oracle_id: ID,
    expiry_ms: u64,
    principal_amount: u64,
    reserve_amount: u64,
    balance_before: u64,
    balance_after: u64,
    target_price: u64,
    floor_price: u64,
    apr_bps: u64,
    strikes: vector<u64>,
    quantities: vector<u64>,
    costs: vector<u64>,
    order_ids: vector<u256>,
    ctx: &mut TxContext,
): ProductNote {
    assert!(balance_after >= balance_before, EBalanceDecreased);
    let net_deposited = balance_after - balance_before;
    assert!(net_deposited >= reserve_amount, EInsufficientCoupon);
    let coupon_amount = net_deposited - reserve_amount;
    new_dual_investment_note(
        registry,
        product_id,
        wrapper_id,
        oracle_id,
        expiry_ms,
        principal_amount,
        reserve_amount,
        coupon_amount,
        target_price,
        floor_price,
        apr_bps,
        strikes,
        quantities,
        costs,
        order_ids,
        ctx,
    )
}

/// Read the wrapper's total available `T` balance (stored + accumulator-pending).
/// Called twice around a subscribe's deposit/mint sequence in the same PTB so
/// `new_dual_investment_note_verified` can derive the real coupon from the delta
/// instead of an off-chain, pre-trade cost estimate.
public fun wrapper_balance<T>(wrapper: &AccountWrapper, root: &AccumulatorRoot, clock: &Clock): u64 {
    account::balance<T>(account::load_account(wrapper), root, clock)
}

public fun new_shark_fin_note_with_mock_current_deposit(
    registry: &Registry,
    product_id: vector<u8>,
    wrapper_id: ID,
    oracle_id: ID,
    expiry_ms: u64,
    principal_amount: u64,
    base_coupon_amount: u64,
    current_yield_amount: u64,
    lower_bound: u64,
    upper_bound: u64,
    is_bullish: bool,
    strikes: vector<u64>,
    quantities: vector<u64>,
    costs: vector<u64>,
    order_ids: vector<u256>,
    ctx: &mut TxContext,
): ProductNote {
    assert_leg_vectors(&strikes, &quantities, &costs, &order_ids);
    new_note(
        registry,
        product_id,
        PRODUCT_SHARK_FIN,
        wrapper_id,
        oracle_id,
        expiry_ms,
        principal_amount,
        principal_amount,
        base_coupon_amount,
        0,
        0,
        lower_bound,
        upper_bound,
        is_bullish,
        true,
        apr_bps_from_coupon(current_yield_amount, principal_amount),
        strikes,
        quantities,
        costs,
        order_ids,
        ctx,
    )
}

public fun record_redeem_with_fee<FeeCoin>(
    registry: &Registry,
    note: &mut ProductNote,
    fee: Coin<FeeCoin>,
    payout_amount: u64,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == note.owner, ENotOwner);
    assert!(note.status == STATUS_OPEN, EAlreadyRedeemed);

    let fee_amount = fee.value();
    note.status = STATUS_REDEEMED;
    note.redeemed_payout_amount = payout_amount;
    note.redeemed_fee_amount = fee_amount;

    event::emit(ProductRedeemed {
        registry_id: object::id(registry),
        note_id: object::id(note),
        owner: note.owner,
        product_kind: note.product_kind,
        wrapper_id: note.wrapper_id,
        oracle_id: note.oracle_id,
        payout_amount,
        fee_amount,
    });

    transfer::public_transfer(fee, registry.fee_recipient);
}

public fun dual_investment_kind(): u8 {
    PRODUCT_DUAL_INVESTMENT
}

public fun shark_fin_kind(): u8 {
    PRODUCT_SHARK_FIN
}

public fun fee_bps(registry: &Registry): u64 {
    registry.fee_bps
}

public fun fee_recipient(registry: &Registry): address {
    registry.fee_recipient
}

public fun owner(note: &ProductNote): address {
    note.owner
}

public fun product_kind(note: &ProductNote): u8 {
    note.product_kind
}

public fun wrapper_id(note: &ProductNote): ID {
    note.wrapper_id
}

public fun oracle_id(note: &ProductNote): ID {
    note.oracle_id
}

public fun target_price(note: &ProductNote): u64 {
    note.target_price
}

public fun floor_price(note: &ProductNote): u64 {
    note.floor_price
}

public fun principal_amount(note: &ProductNote): u64 {
    note.principal_amount
}

public fun reserve_amount(note: &ProductNote): u64 {
    note.reserve_amount
}

public fun coupon_amount(note: &ProductNote): u64 {
    note.coupon_amount
}

public fun lower_bound(note: &ProductNote): u64 {
    note.lower_bound
}

public fun upper_bound(note: &ProductNote): u64 {
    note.upper_bound
}

public fun is_bullish(note: &ProductNote): bool {
    note.is_bullish
}

public fun uses_mock_current_deposit(note: &ProductNote): bool {
    note.uses_mock_current_deposit
}

public fun leg_count(note: &ProductNote): u64 {
    note.strikes.length()
}

public fun order_ids(note: &ProductNote): &vector<u256> {
    &note.order_ids
}

public fun is_redeemed(note: &ProductNote): bool {
    note.status == STATUS_REDEEMED
}

public fun redeemed_payout_amount(note: &ProductNote): u64 {
    note.redeemed_payout_amount
}

public fun redeemed_fee_amount(note: &ProductNote): u64 {
    note.redeemed_fee_amount
}

// === Test Helpers ===

#[test_only]
public fun new_registry_for_testing(
    fee_bps: u64,
    fee_recipient: address,
    ctx: &mut TxContext,
): (Registry, AdminCap) {
    assert!(fee_bps <= MAX_FEE_BPS, EFeeTooHigh);
    (
        Registry {
            id: object::new(ctx),
            fee_bps,
            fee_recipient,
        },
        AdminCap { id: object::new(ctx) },
    )
}

// === Private Functions ===

fun new_note(
    registry: &Registry,
    product_id: vector<u8>,
    product_kind: u8,
    wrapper_id: ID,
    oracle_id: ID,
    expiry_ms: u64,
    principal_amount: u64,
    reserve_amount: u64,
    coupon_amount: u64,
    target_price: u64,
    floor_price: u64,
    lower_bound: u64,
    upper_bound: u64,
    is_bullish: bool,
    uses_mock_current_deposit: bool,
    apr_bps: u64,
    strikes: vector<u64>,
    quantities: vector<u64>,
    costs: vector<u64>,
    order_ids: vector<u256>,
    ctx: &mut TxContext,
): ProductNote {
    let note = ProductNote {
        id: object::new(ctx),
        owner: ctx.sender(),
        product_kind,
        product_id,
        wrapper_id,
        oracle_id,
        expiry_ms,
        principal_amount,
        reserve_amount,
        coupon_amount,
        target_price,
        floor_price,
        lower_bound,
        upper_bound,
        is_bullish,
        uses_mock_current_deposit,
        apr_bps,
        fee_bps: registry.fee_bps,
        strikes,
        quantities,
        costs,
        order_ids,
        status: STATUS_OPEN,
        redeemed_payout_amount: 0,
        redeemed_fee_amount: 0,
    };
    let note_id = object::id(&note);
    let leg_count = note.strikes.length();

    event::emit(ProductSubscribed {
        registry_id: object::id(registry),
        note_id,
        owner: note.owner,
        product_kind,
        wrapper_id,
        oracle_id,
        expiry_ms,
        principal_amount,
        fee_bps: registry.fee_bps,
        leg_count,
        order_ids: note.order_ids,
    });

    note
}

fun assert_leg_vectors(
    strikes: &vector<u64>,
    quantities: &vector<u64>,
    costs: &vector<u64>,
    order_ids: &vector<u256>,
) {
    assert!(strikes.length() == quantities.length(), EInvalidLegVectors);
    assert!(strikes.length() == costs.length(), EInvalidLegVectors);
    assert!(strikes.length() == order_ids.length(), EInvalidLegVectors);
}

fun apr_bps_from_coupon(coupon_amount: u64, principal_amount: u64): u64 {
    if (principal_amount == 0) {
        0
    } else {
        ((coupon_amount as u128) * 10_000 / (principal_amount as u128)) as u64
    }
}
