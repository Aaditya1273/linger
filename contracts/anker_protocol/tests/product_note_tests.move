#[test_only]
module anker_protocol::product_note_tests;

use anker_protocol::product_note;
use std::unit_test::{assert_eq, destroy};
use sui::{coin, object, sui::SUI};

#[test]
fun fee_policy_can_be_updated_by_admin_cap() {
    let mut ctx = tx_context::dummy();
    let (mut registry, admin_cap) = product_note::new_registry_for_testing(1_000, @0xA, &mut ctx);

    product_note::set_fee_policy(&mut registry, &admin_cap, 1_500, @0xB);

    assert_eq!(product_note::fee_bps(&registry), 1_500);
    assert_eq!(product_note::fee_recipient(&registry), @0xB);

    destroy(registry);
    destroy(admin_cap);
}

#[test]
fun dual_investment_note_records_product_terms_and_order_ids() {
    let mut ctx = tx_context::dummy();
    let (registry, admin_cap) = product_note::new_registry_for_testing(1_000, @0xA, &mut ctx);
    let wrapper_id = object::id_from_address(@0xCAFE);
    let oracle_id = object::id_from_address(@0xBEEF);
    let order_ids = vector[11u256, 22u256, 33u256];

    let note = product_note::new_dual_investment_note(
        &registry,
        b"dual-target-buy-demo",
        wrapper_id,
        oracle_id,
        1_781_683_200_000,
        1_000_000_000,
        610_000_000,
        20_000_000,
        66_000_000_000,
        61_000_000_000,
        19_264,
        vector[61_000_000_000, 62_000_000_000, 63_000_000_000],
        vector[10_000_000, 10_000_000, 10_000_000],
        vector[2_000_000, 2_100_000, 2_200_000],
        order_ids,
        &mut ctx,
    );

    assert_eq!(product_note::product_kind(&note), product_note::dual_investment_kind());
    assert_eq!(product_note::wrapper_id(&note), wrapper_id);
    assert_eq!(product_note::oracle_id(&note), oracle_id);
    assert_eq!(product_note::target_price(&note), 66_000_000_000);
    assert_eq!(product_note::floor_price(&note), 61_000_000_000);
    assert_eq!(product_note::principal_amount(&note), 1_000_000_000);
    assert_eq!(product_note::reserve_amount(&note), 610_000_000);
    assert_eq!(product_note::coupon_amount(&note), 20_000_000);
    assert_eq!(product_note::leg_count(&note), 3);
    assert_eq!(*product_note::order_ids(&note), order_ids);
    assert!(!product_note::is_redeemed(&note));

    destroy(note);
    destroy(registry);
    destroy(admin_cap);
}

#[test]
fun shark_fin_note_records_mock_current_deposit_terms_and_order_ids() {
    let mut ctx = tx_context::dummy();
    let (registry, admin_cap) = product_note::new_registry_for_testing(1_000, @0xA, &mut ctx);
    let wrapper_id = object::id_from_address(@0xCAFE);
    let oracle_id = object::id_from_address(@0xBEEF);
    let order_ids = vector[44u256, 55u256];

    let note = product_note::new_shark_fin_note_with_mock_current_deposit(
        &registry,
        b"shark-bull-demo",
        wrapper_id,
        oracle_id,
        1_781_683_200_000,
        1_000_000_000,
        20_000_000,
        80_000_000,
        66_000_000_000,
        73_000_000_000,
        true,
        vector[66_000_000_000, 67_000_000_000],
        vector[5_000_000, 5_000_000],
        vector[1_000_000, 1_100_000],
        order_ids,
        &mut ctx,
    );

    assert_eq!(product_note::product_kind(&note), product_note::shark_fin_kind());
    assert_eq!(product_note::wrapper_id(&note), wrapper_id);
    assert_eq!(product_note::oracle_id(&note), oracle_id);
    assert_eq!(product_note::lower_bound(&note), 66_000_000_000);
    assert_eq!(product_note::upper_bound(&note), 73_000_000_000);
    assert!(product_note::is_bullish(&note));
    assert!(product_note::uses_mock_current_deposit(&note));
    assert_eq!(*product_note::order_ids(&note), order_ids);

    destroy(note);
    destroy(registry);
    destroy(admin_cap);
}

#[test, expected_failure(abort_code = 1, location = anker_protocol::product_note)]
fun subscribe_rejects_order_ids_length_mismatch() {
    let mut ctx = tx_context::dummy();
    let (registry, admin_cap) = product_note::new_registry_for_testing(1_000, @0xA, &mut ctx);
    let wrapper_id = object::id_from_address(@0xCAFE);
    let oracle_id = object::id_from_address(@0xBEEF);

    let note = product_note::new_dual_investment_note(
        &registry,
        b"dual-target-buy-demo",
        wrapper_id,
        oracle_id,
        1_781_683_200_000,
        1_000_000_000,
        610_000_000,
        20_000_000,
        66_000_000_000,
        61_000_000_000,
        19_264,
        vector[61_000_000_000, 62_000_000_000],
        vector[10_000_000, 10_000_000],
        vector[2_000_000, 2_100_000],
        vector[11u256],
        &mut ctx,
    );

    destroy(note);
    destroy(registry);
    destroy(admin_cap);
}

#[test]
fun verified_note_derives_coupon_from_real_balance_delta() {
    let mut ctx = tx_context::dummy();
    let (registry, admin_cap) = product_note::new_registry_for_testing(1_000, @0xA, &mut ctx);
    let wrapper_id = object::id_from_address(@0xCAFE);
    let oracle_id = object::id_from_address(@0xBEEF);

    let note = product_note::new_dual_investment_note_verified(
        &registry,
        b"dual-target-buy-demo",
        wrapper_id,
        oracle_id,
        1_781_683_200_000,
        1_000_000_000,
        610_000_000,
        0,
        630_000_000,
        66_000_000_000,
        61_000_000_000,
        19_264,
        vector[61_000_000_000],
        vector[10_000_000],
        vector[2_000_000],
        vector[99u256],
        &mut ctx,
    );

    assert_eq!(product_note::reserve_amount(&note), 610_000_000);
    assert_eq!(product_note::coupon_amount(&note), 20_000_000);

    destroy(note);
    destroy(registry);
    destroy(admin_cap);
}

#[test, expected_failure(abort_code = 5, location = anker_protocol::product_note)]
fun verified_note_rejects_shortfall_that_cannot_cover_reserve() {
    let mut ctx = tx_context::dummy();
    let (registry, admin_cap) = product_note::new_registry_for_testing(1_000, @0xA, &mut ctx);
    let wrapper_id = object::id_from_address(@0xCAFE);
    let oracle_id = object::id_from_address(@0xBEEF);

    // Mint slippage ate into principal enough that what's left (600_000_000)
    // can no longer cover the promised reserve (610_000_000): subscribe must
    // abort here instead of minting a note claim can never fully honor.
    let note = product_note::new_dual_investment_note_verified(
        &registry,
        b"dual-target-buy-demo",
        wrapper_id,
        oracle_id,
        1_781_683_200_000,
        1_000_000_000,
        610_000_000,
        0,
        600_000_000,
        66_000_000_000,
        61_000_000_000,
        19_264,
        vector[61_000_000_000],
        vector[10_000_000],
        vector[2_000_000],
        vector[99u256],
        &mut ctx,
    );

    destroy(note);
    destroy(registry);
    destroy(admin_cap);
}

#[test, expected_failure(abort_code = 4, location = anker_protocol::product_note)]
fun verified_note_rejects_balance_that_decreased() {
    let mut ctx = tx_context::dummy();
    let (registry, admin_cap) = product_note::new_registry_for_testing(1_000, @0xA, &mut ctx);
    let wrapper_id = object::id_from_address(@0xCAFE);
    let oracle_id = object::id_from_address(@0xBEEF);

    let note = product_note::new_dual_investment_note_verified(
        &registry,
        b"dual-target-buy-demo",
        wrapper_id,
        oracle_id,
        1_781_683_200_000,
        1_000_000_000,
        610_000_000,
        630_000_000,
        0,
        66_000_000_000,
        61_000_000_000,
        19_264,
        vector[61_000_000_000],
        vector[10_000_000],
        vector[2_000_000],
        vector[99u256],
        &mut ctx,
    );

    destroy(note);
    destroy(registry);
    destroy(admin_cap);
}

#[test]
fun redeem_marks_note_and_records_fee() {
    let mut ctx = tx_context::dummy();
    let (registry, admin_cap) = product_note::new_registry_for_testing(1_000, @0xA, &mut ctx);
    let wrapper_id = object::id_from_address(@0xCAFE);
    let oracle_id = object::id_from_address(@0xBEEF);
    let mut note = product_note::new_dual_investment_note(
        &registry,
        b"dual-target-buy-demo",
        wrapper_id,
        oracle_id,
        1_781_683_200_000,
        1_000_000_000,
        610_000_000,
        20_000_000,
        66_000_000_000,
        61_000_000_000,
        19_264,
        vector[61_000_000_000],
        vector[10_000_000],
        vector[2_000_000],
        vector[99u256],
        &mut ctx,
    );
    let fee = coin::zero<SUI>(&mut ctx);

    product_note::record_redeem_with_fee(&registry, &mut note, fee, 1_030_000_000, &mut ctx);

    assert!(product_note::is_redeemed(&note));
    assert_eq!(product_note::redeemed_payout_amount(&note), 1_030_000_000);
    assert_eq!(product_note::redeemed_fee_amount(&note), 0);

    destroy(note);
    destroy(registry);
    destroy(admin_cap);
}
