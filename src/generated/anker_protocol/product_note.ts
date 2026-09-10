/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/anker-protocol::product_note';
export const PRODUCT_NOTE = new MoveStruct({ name: `${$moduleName}::PRODUCT_NOTE`, fields: {
        dummy_field: bcs.bool()
    } });
export const AdminCap = new MoveStruct({ name: `${$moduleName}::AdminCap`, fields: {
        id: bcs.Address
    } });
export const Registry = new MoveStruct({ name: `${$moduleName}::Registry`, fields: {
        id: bcs.Address,
        fee_bps: bcs.u64(),
        fee_recipient: bcs.Address
    } });
export const ProductNote = new MoveStruct({ name: `${$moduleName}::ProductNote`, fields: {
        id: bcs.Address,
        owner: bcs.Address,
        product_kind: bcs.u8(),
        product_id: bcs.vector(bcs.u8()),
        wrapper_id: bcs.Address,
        oracle_id: bcs.Address,
        expiry_ms: bcs.u64(),
        principal_amount: bcs.u64(),
        reserve_amount: bcs.u64(),
        coupon_amount: bcs.u64(),
        target_price: bcs.u64(),
        floor_price: bcs.u64(),
        lower_bound: bcs.u64(),
        upper_bound: bcs.u64(),
        is_bullish: bcs.bool(),
        uses_mock_current_deposit: bcs.bool(),
        apr_bps: bcs.u64(),
        fee_bps: bcs.u64(),
        strikes: bcs.vector(bcs.u64()),
        quantities: bcs.vector(bcs.u64()),
        costs: bcs.vector(bcs.u64()),
        order_ids: bcs.vector(bcs.u256()),
        status: bcs.u8(),
        redeemed_payout_amount: bcs.u64(),
        redeemed_fee_amount: bcs.u64()
    } });
export const FeePolicyUpdated = new MoveStruct({ name: `${$moduleName}::FeePolicyUpdated`, fields: {
        registry_id: bcs.Address,
        fee_bps: bcs.u64(),
        fee_recipient: bcs.Address
    } });
export const ProductSubscribed = new MoveStruct({ name: `${$moduleName}::ProductSubscribed`, fields: {
        registry_id: bcs.Address,
        note_id: bcs.Address,
        owner: bcs.Address,
        product_kind: bcs.u8(),
        wrapper_id: bcs.Address,
        oracle_id: bcs.Address,
        expiry_ms: bcs.u64(),
        principal_amount: bcs.u64(),
        fee_bps: bcs.u64(),
        leg_count: bcs.u64(),
        order_ids: bcs.vector(bcs.u256())
    } });
export const ProductRedeemed = new MoveStruct({ name: `${$moduleName}::ProductRedeemed`, fields: {
        registry_id: bcs.Address,
        note_id: bcs.Address,
        owner: bcs.Address,
        product_kind: bcs.u8(),
        wrapper_id: bcs.Address,
        oracle_id: bcs.Address,
        payout_amount: bcs.u64(),
        fee_amount: bcs.u64()
    } });
export interface SetFeePolicyArguments {
    registry: RawTransactionArgument<string>;
    _: RawTransactionArgument<string>;
    feeBps: RawTransactionArgument<number | bigint>;
    feeRecipient: RawTransactionArgument<string>;
}
export interface SetFeePolicyOptions {
    package?: string;
    arguments: SetFeePolicyArguments | [
        registry: RawTransactionArgument<string>,
        _: RawTransactionArgument<string>,
        feeBps: RawTransactionArgument<number | bigint>,
        feeRecipient: RawTransactionArgument<string>
    ];
}
export function setFeePolicy(options: SetFeePolicyOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null,
        null,
        'u64',
        'address'
    ] satisfies (string | null)[];
    const parameterNames = ["registry", "_", "feeBps", "feeRecipient"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'set_fee_policy',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewDualInvestmentNoteArguments {
    registry: RawTransactionArgument<string>;
    productId: RawTransactionArgument<Array<number>>;
    wrapperId: RawTransactionArgument<string>;
    oracleId: RawTransactionArgument<string>;
    expiryMs: RawTransactionArgument<number | bigint>;
    principalAmount: RawTransactionArgument<number | bigint>;
    reserveAmount: RawTransactionArgument<number | bigint>;
    couponAmount: RawTransactionArgument<number | bigint>;
    targetPrice: RawTransactionArgument<number | bigint>;
    floorPrice: RawTransactionArgument<number | bigint>;
    aprBps: RawTransactionArgument<number | bigint>;
    strikes: RawTransactionArgument<Array<number | bigint>>;
    quantities: RawTransactionArgument<Array<number | bigint>>;
    costs: RawTransactionArgument<Array<number | bigint>>;
    orderIds: RawTransactionArgument<Array<number | bigint>>;
}
export interface NewDualInvestmentNoteOptions {
    package?: string;
    arguments: NewDualInvestmentNoteArguments | [
        registry: RawTransactionArgument<string>,
        productId: RawTransactionArgument<Array<number>>,
        wrapperId: RawTransactionArgument<string>,
        oracleId: RawTransactionArgument<string>,
        expiryMs: RawTransactionArgument<number | bigint>,
        principalAmount: RawTransactionArgument<number | bigint>,
        reserveAmount: RawTransactionArgument<number | bigint>,
        couponAmount: RawTransactionArgument<number | bigint>,
        targetPrice: RawTransactionArgument<number | bigint>,
        floorPrice: RawTransactionArgument<number | bigint>,
        aprBps: RawTransactionArgument<number | bigint>,
        strikes: RawTransactionArgument<Array<number | bigint>>,
        quantities: RawTransactionArgument<Array<number | bigint>>,
        costs: RawTransactionArgument<Array<number | bigint>>,
        orderIds: RawTransactionArgument<Array<number | bigint>>
    ];
}
export function newDualInvestmentNote(options: NewDualInvestmentNoteOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null,
        'vector<u8>',
        '0x2::object::ID',
        '0x2::object::ID',
        'u64',
        'u64',
        'u64',
        'u64',
        'u64',
        'u64',
        'u64',
        'vector<u64>',
        'vector<u64>',
        'vector<u64>',
        'vector<u256>'
    ] satisfies (string | null)[];
    const parameterNames = ["registry", "productId", "wrapperId", "oracleId", "expiryMs", "principalAmount", "reserveAmount", "couponAmount", "targetPrice", "floorPrice", "aprBps", "strikes", "quantities", "costs", "orderIds"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'new_dual_investment_note',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NewDualInvestmentNoteVerifiedArguments {
    registry: RawTransactionArgument<string>;
    productId: RawTransactionArgument<Array<number>>;
    wrapperId: RawTransactionArgument<string>;
    oracleId: RawTransactionArgument<string>;
    expiryMs: RawTransactionArgument<number | bigint>;
    principalAmount: RawTransactionArgument<number | bigint>;
    reserveAmount: RawTransactionArgument<number | bigint>;
    balanceBefore: RawTransactionArgument<number | bigint>;
    balanceAfter: RawTransactionArgument<number | bigint>;
    targetPrice: RawTransactionArgument<number | bigint>;
    floorPrice: RawTransactionArgument<number | bigint>;
    aprBps: RawTransactionArgument<number | bigint>;
    strikes: RawTransactionArgument<Array<number | bigint>>;
    quantities: RawTransactionArgument<Array<number | bigint>>;
    costs: RawTransactionArgument<Array<number | bigint>>;
    orderIds: RawTransactionArgument<Array<number | bigint>>;
}
export interface NewDualInvestmentNoteVerifiedOptions {
    package?: string;
    arguments: NewDualInvestmentNoteVerifiedArguments | [
        registry: RawTransactionArgument<string>,
        productId: RawTransactionArgument<Array<number>>,
        wrapperId: RawTransactionArgument<string>,
        oracleId: RawTransactionArgument<string>,
        expiryMs: RawTransactionArgument<number | bigint>,
        principalAmount: RawTransactionArgument<number | bigint>,
        reserveAmount: RawTransactionArgument<number | bigint>,
        balanceBefore: RawTransactionArgument<number | bigint>,
        balanceAfter: RawTransactionArgument<number | bigint>,
        targetPrice: RawTransactionArgument<number | bigint>,
        floorPrice: RawTransactionArgument<number | bigint>,
        aprBps: RawTransactionArgument<number | bigint>,
        strikes: RawTransactionArgument<Array<number | bigint>>,
        quantities: RawTransactionArgument<Array<number | bigint>>,
        costs: RawTransactionArgument<Array<number | bigint>>,
        orderIds: RawTransactionArgument<Array<number | bigint>>
    ];
}
/**
 * Same as `new_dual_investment_note`, except `coupon_amount` is derived on-chain
 * from `balance_before`/`balance_after` (the wrapper's own `wrapper_balance`
 * reads, taken immediately before the subscribe deposit and immediately after the
 * last leg mint in the same PTB) instead of trusting a client-supplied estimate.
 * Ties the note's guaranteed payout to what minting actually consumed, so a claim
 * can never be asked to withdraw more than the account actually holds for this
 * note. Kept as a separate function (rather than changing
 * `new_dual_investment_note`'s signature in place) so upgrades stay compatible
 * with notes minted before this.
 */
export function newDualInvestmentNoteVerified(options: NewDualInvestmentNoteVerifiedOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null,
        'vector<u8>',
        '0x2::object::ID',
        '0x2::object::ID',
        'u64',
        'u64',
        'u64',
        'u64',
        'u64',
        'u64',
        'u64',
        'u64',
        'vector<u64>',
        'vector<u64>',
        'vector<u64>',
        'vector<u256>'
    ] satisfies (string | null)[];
    const parameterNames = ["registry", "productId", "wrapperId", "oracleId", "expiryMs", "principalAmount", "reserveAmount", "balanceBefore", "balanceAfter", "targetPrice", "floorPrice", "aprBps", "strikes", "quantities", "costs", "orderIds"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'new_dual_investment_note_verified',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface WrapperBalanceArguments {
    wrapper: RawTransactionArgument<string>;
    root: RawTransactionArgument<string>;
}
export interface WrapperBalanceOptions {
    package?: string;
    arguments: WrapperBalanceArguments | [
        wrapper: RawTransactionArgument<string>,
        root: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
/**
 * Read the wrapper's total available `T` balance (stored + accumulator-pending).
 * Called twice around a subscribe's deposit/mint sequence in the same PTB so
 * `new_dual_investment_note_verified` can derive the real coupon from the delta
 * instead of an off-chain, pre-trade cost estimate.
 */
export function wrapperBalance(options: WrapperBalanceOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null,
        null,
        '0x2::clock::Clock'
    ] satisfies (string | null)[];
    const parameterNames = ["wrapper", "root"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'wrapper_balance',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface NewSharkFinNoteWithMockCurrentDepositArguments {
    registry: RawTransactionArgument<string>;
    productId: RawTransactionArgument<Array<number>>;
    wrapperId: RawTransactionArgument<string>;
    oracleId: RawTransactionArgument<string>;
    expiryMs: RawTransactionArgument<number | bigint>;
    principalAmount: RawTransactionArgument<number | bigint>;
    baseCouponAmount: RawTransactionArgument<number | bigint>;
    currentYieldAmount: RawTransactionArgument<number | bigint>;
    lowerBound: RawTransactionArgument<number | bigint>;
    upperBound: RawTransactionArgument<number | bigint>;
    isBullish: RawTransactionArgument<boolean>;
    strikes: RawTransactionArgument<Array<number | bigint>>;
    quantities: RawTransactionArgument<Array<number | bigint>>;
    costs: RawTransactionArgument<Array<number | bigint>>;
    orderIds: RawTransactionArgument<Array<number | bigint>>;
}
export interface NewSharkFinNoteWithMockCurrentDepositOptions {
    package?: string;
    arguments: NewSharkFinNoteWithMockCurrentDepositArguments | [
        registry: RawTransactionArgument<string>,
        productId: RawTransactionArgument<Array<number>>,
        wrapperId: RawTransactionArgument<string>,
        oracleId: RawTransactionArgument<string>,
        expiryMs: RawTransactionArgument<number | bigint>,
        principalAmount: RawTransactionArgument<number | bigint>,
        baseCouponAmount: RawTransactionArgument<number | bigint>,
        currentYieldAmount: RawTransactionArgument<number | bigint>,
        lowerBound: RawTransactionArgument<number | bigint>,
        upperBound: RawTransactionArgument<number | bigint>,
        isBullish: RawTransactionArgument<boolean>,
        strikes: RawTransactionArgument<Array<number | bigint>>,
        quantities: RawTransactionArgument<Array<number | bigint>>,
        costs: RawTransactionArgument<Array<number | bigint>>,
        orderIds: RawTransactionArgument<Array<number | bigint>>
    ];
}
export function newSharkFinNoteWithMockCurrentDeposit(options: NewSharkFinNoteWithMockCurrentDepositOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null,
        'vector<u8>',
        '0x2::object::ID',
        '0x2::object::ID',
        'u64',
        'u64',
        'u64',
        'u64',
        'u64',
        'u64',
        'bool',
        'vector<u64>',
        'vector<u64>',
        'vector<u64>',
        'vector<u256>'
    ] satisfies (string | null)[];
    const parameterNames = ["registry", "productId", "wrapperId", "oracleId", "expiryMs", "principalAmount", "baseCouponAmount", "currentYieldAmount", "lowerBound", "upperBound", "isBullish", "strikes", "quantities", "costs", "orderIds"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'new_shark_fin_note_with_mock_current_deposit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RecordRedeemWithFeeArguments {
    registry: RawTransactionArgument<string>;
    note: RawTransactionArgument<string>;
    fee: RawTransactionArgument<string>;
    payoutAmount: RawTransactionArgument<number | bigint>;
}
export interface RecordRedeemWithFeeOptions {
    package?: string;
    arguments: RecordRedeemWithFeeArguments | [
        registry: RawTransactionArgument<string>,
        note: RawTransactionArgument<string>,
        fee: RawTransactionArgument<string>,
        payoutAmount: RawTransactionArgument<number | bigint>
    ];
    typeArguments: [
        string
    ];
}
export function recordRedeemWithFee(options: RecordRedeemWithFeeOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null,
        null,
        null,
        'u64'
    ] satisfies (string | null)[];
    const parameterNames = ["registry", "note", "fee", "payoutAmount"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'record_redeem_with_fee',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}
export interface DualInvestmentKindOptions {
    package?: string;
    arguments?: [
    ];
}
export function dualInvestmentKind(options: DualInvestmentKindOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'dual_investment_kind',
    });
}
export interface SharkFinKindOptions {
    package?: string;
    arguments?: [
    ];
}
export function sharkFinKind(options: SharkFinKindOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'shark_fin_kind',
    });
}
export interface FeeBpsArguments {
    registry: RawTransactionArgument<string>;
}
export interface FeeBpsOptions {
    package?: string;
    arguments: FeeBpsArguments | [
        registry: RawTransactionArgument<string>
    ];
}
export function feeBps(options: FeeBpsOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["registry"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'fee_bps',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface FeeRecipientArguments {
    registry: RawTransactionArgument<string>;
}
export interface FeeRecipientOptions {
    package?: string;
    arguments: FeeRecipientArguments | [
        registry: RawTransactionArgument<string>
    ];
}
export function feeRecipient(options: FeeRecipientOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["registry"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'fee_recipient',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface OwnerArguments {
    note: RawTransactionArgument<string>;
}
export interface OwnerOptions {
    package?: string;
    arguments: OwnerArguments | [
        note: RawTransactionArgument<string>
    ];
}
export function owner(options: OwnerOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["note"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'owner',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ProductKindArguments {
    note: RawTransactionArgument<string>;
}
export interface ProductKindOptions {
    package?: string;
    arguments: ProductKindArguments | [
        note: RawTransactionArgument<string>
    ];
}
export function productKind(options: ProductKindOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["note"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'product_kind',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface WrapperIdArguments {
    note: RawTransactionArgument<string>;
}
export interface WrapperIdOptions {
    package?: string;
    arguments: WrapperIdArguments | [
        note: RawTransactionArgument<string>
    ];
}
export function wrapperId(options: WrapperIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["note"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'wrapper_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface OracleIdArguments {
    note: RawTransactionArgument<string>;
}
export interface OracleIdOptions {
    package?: string;
    arguments: OracleIdArguments | [
        note: RawTransactionArgument<string>
    ];
}
export function oracleId(options: OracleIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["note"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'oracle_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TargetPriceArguments {
    note: RawTransactionArgument<string>;
}
export interface TargetPriceOptions {
    package?: string;
    arguments: TargetPriceArguments | [
        note: RawTransactionArgument<string>
    ];
}
export function targetPrice(options: TargetPriceOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["note"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'target_price',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface FloorPriceArguments {
    note: RawTransactionArgument<string>;
}
export interface FloorPriceOptions {
    package?: string;
    arguments: FloorPriceArguments | [
        note: RawTransactionArgument<string>
    ];
}
export function floorPrice(options: FloorPriceOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["note"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'floor_price',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface PrincipalAmountArguments {
    note: RawTransactionArgument<string>;
}
export interface PrincipalAmountOptions {
    package?: string;
    arguments: PrincipalAmountArguments | [
        note: RawTransactionArgument<string>
    ];
}
export function principalAmount(options: PrincipalAmountOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["note"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'principal_amount',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReserveAmountArguments {
    note: RawTransactionArgument<string>;
}
export interface ReserveAmountOptions {
    package?: string;
    arguments: ReserveAmountArguments | [
        note: RawTransactionArgument<string>
    ];
}
export function reserveAmount(options: ReserveAmountOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["note"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'reserve_amount',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CouponAmountArguments {
    note: RawTransactionArgument<string>;
}
export interface CouponAmountOptions {
    package?: string;
    arguments: CouponAmountArguments | [
        note: RawTransactionArgument<string>
    ];
}
export function couponAmount(options: CouponAmountOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["note"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'coupon_amount',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface LowerBoundArguments {
    note: RawTransactionArgument<string>;
}
export interface LowerBoundOptions {
    package?: string;
    arguments: LowerBoundArguments | [
        note: RawTransactionArgument<string>
    ];
}
export function lowerBound(options: LowerBoundOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["note"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'lower_bound',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface UpperBoundArguments {
    note: RawTransactionArgument<string>;
}
export interface UpperBoundOptions {
    package?: string;
    arguments: UpperBoundArguments | [
        note: RawTransactionArgument<string>
    ];
}
export function upperBound(options: UpperBoundOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["note"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'upper_bound',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsBullishArguments {
    note: RawTransactionArgument<string>;
}
export interface IsBullishOptions {
    package?: string;
    arguments: IsBullishArguments | [
        note: RawTransactionArgument<string>
    ];
}
export function isBullish(options: IsBullishOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["note"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'is_bullish',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface UsesMockCurrentDepositArguments {
    note: RawTransactionArgument<string>;
}
export interface UsesMockCurrentDepositOptions {
    package?: string;
    arguments: UsesMockCurrentDepositArguments | [
        note: RawTransactionArgument<string>
    ];
}
export function usesMockCurrentDeposit(options: UsesMockCurrentDepositOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["note"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'uses_mock_current_deposit',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface LegCountArguments {
    note: RawTransactionArgument<string>;
}
export interface LegCountOptions {
    package?: string;
    arguments: LegCountArguments | [
        note: RawTransactionArgument<string>
    ];
}
export function legCount(options: LegCountOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["note"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'leg_count',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface OrderIdsArguments {
    note: RawTransactionArgument<string>;
}
export interface OrderIdsOptions {
    package?: string;
    arguments: OrderIdsArguments | [
        note: RawTransactionArgument<string>
    ];
}
export function orderIds(options: OrderIdsOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["note"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'order_ids',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsRedeemedArguments {
    note: RawTransactionArgument<string>;
}
export interface IsRedeemedOptions {
    package?: string;
    arguments: IsRedeemedArguments | [
        note: RawTransactionArgument<string>
    ];
}
export function isRedeemed(options: IsRedeemedOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["note"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'is_redeemed',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RedeemedPayoutAmountArguments {
    note: RawTransactionArgument<string>;
}
export interface RedeemedPayoutAmountOptions {
    package?: string;
    arguments: RedeemedPayoutAmountArguments | [
        note: RawTransactionArgument<string>
    ];
}
export function redeemedPayoutAmount(options: RedeemedPayoutAmountOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["note"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'redeemed_payout_amount',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RedeemedFeeAmountArguments {
    note: RawTransactionArgument<string>;
}
export interface RedeemedFeeAmountOptions {
    package?: string;
    arguments: RedeemedFeeAmountArguments | [
        note: RawTransactionArgument<string>
    ];
}
export function redeemedFeeAmount(options: RedeemedFeeAmountOptions) {
    const packageAddress = options.package ?? '@local-pkg/anker-protocol';
    const argumentsTypes = [
        null
    ] satisfies (string | null)[];
    const parameterNames = ["note"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'product_note',
        function: 'redeemed_fee_amount',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}