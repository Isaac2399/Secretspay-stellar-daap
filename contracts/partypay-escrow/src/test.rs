#![cfg(test)]

extern crate std;

use soroban_sdk::{
    testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation},
    token, Address, Env, IntoVal, String, Symbol, Vec,
};

use crate::{
    line_gross, payable_units, split_fee, Error, PartyPayEscrow, PartyPayEscrowClient, SaleLine,
};

fn create_token<'a>(
    env: &Env,
    admin: &Address,
) -> (token::Client<'a>, token::StellarAssetClient<'a>) {
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    (
        token::Client::new(env, &sac.address()),
        token::StellarAssetClient::new(env, &sac.address()),
    )
}

fn setup<'a>(
    fee_bps: u32,
) -> (
    Env,
    PartyPayEscrowClient<'a>,
    Address,
    Address,
    Address,
    token::Client<'a>,
    token::StellarAssetClient<'a>,
) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let merchant = Address::generate(&env);
    let depositor = Address::generate(&env);
    let contract_id = env.register(PartyPayEscrow, ());
    let client = PartyPayEscrowClient::new(&env, &contract_id);
    client.initialize(&admin, &fee_bps);

    let token_admin = Address::generate(&env);
    let (token, token_admin_client) = create_token(&env, &token_admin);

    (
        env,
        client,
        admin,
        merchant,
        depositor,
        token,
        token_admin_client,
    )
}

#[test]
fn split_fee_rounds_remainder_toward_the_merchant() {
    assert_eq!(split_fee(10_000, 250), Ok((250, 9_750)));
    // 3 * 50 % = 1,5. La plataforma cobra 1 y el comercio se queda 2.
    assert_eq!(split_fee(3, 5_000), Ok((1, 2)));
    assert_eq!(split_fee(1, 250), Ok((0, 1)));
    assert_eq!(split_fee(8_000, 0), Ok((0, 8_000)));
    assert_eq!(split_fee(8_000, 10_000), Ok((8_000, 0)));
    assert_eq!(split_fee(0, 250), Err(Error::InvalidAmount));
    assert_eq!(split_fee(100, 10_001), Err(Error::InvalidFee));
}

#[test]
fn initialize_stores_admin_and_fee_once() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(PartyPayEscrow, ());
    let client = PartyPayEscrowClient::new(&env, &contract_id);

    client.initialize(&admin, &250);
    assert_eq!(client.get_admin(), Some(admin.clone()));
    assert_eq!(client.get_fee_bps(), Some(250));

    assert_eq!(
        client.try_initialize(&admin, &250),
        Err(Ok(Error::AlreadyInitialized))
    );
    assert_eq!(
        client.try_initialize(&Address::generate(&env), &100),
        Err(Ok(Error::AlreadyInitialized))
    );
}

#[test]
fn initialize_rejects_fee_above_one_hundred_percent() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let client = PartyPayEscrowClient::new(&env, &env.register(PartyPayEscrow, ()));

    assert_eq!(
        client.try_initialize(&admin, &10_001),
        Err(Ok(Error::InvalidFee))
    );
    assert_eq!(client.get_admin(), None);

    client.initialize(&admin, &0);
    assert_eq!(client.get_fee_bps(), Some(0));
}

#[test]
fn initialize_requires_the_admin_signature() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(PartyPayEscrow, ());
    let client = PartyPayEscrowClient::new(&env, &contract_id);

    assert!(client.try_initialize(&admin, &250).is_err());
    assert_eq!(client.get_admin(), None);
}

#[test]
fn deposit_credits_the_vault_and_requires_the_depositor() {
    let (env, client, _admin, _merchant, depositor, token, token_admin) = setup(250);
    token_admin.mint(&depositor, &10_000);

    client.deposit(&depositor, &4_000, &token.address);
    assert_eq!(
        env.auths(),
        std::vec![(
            depositor.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    client.address.clone(),
                    Symbol::new(&env, "deposit"),
                    (&depositor, 4_000_i128, &token.address).into_val(&env),
                )),
                sub_invocations: std::vec![AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        token.address.clone(),
                        Symbol::new(&env, "transfer"),
                        (&depositor, &client.address, 4_000_i128).into_val(&env),
                    )),
                    sub_invocations: std::vec![],
                }],
            }
        )]
    );

    client.deposit(&depositor, &6_000, &token.address);

    assert_eq!(token.balance(&depositor), 0);
    assert_eq!(token.balance(&client.address), 10_000);
    assert_eq!(client.get_vault_balance(&token.address), 10_000);
    assert_eq!(
        client.try_deposit(&depositor, &0, &token.address),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        client.try_deposit(&depositor, &-5, &token.address),
        Err(Ok(Error::InvalidAmount))
    );
}

#[test]
fn deposit_and_sale_fail_before_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let client = PartyPayEscrowClient::new(&env, &env.register(PartyPayEscrow, ()));
    let from = Address::generate(&env);
    let token = Address::generate(&env);

    assert_eq!(
        client.try_deposit(&from, &1, &token),
        Err(Ok(Error::NotInitialized))
    );
    assert_eq!(
        client.try_record_sale(&from, &1),
        Err(Ok(Error::NotInitialized))
    );
    assert_eq!(
        client.try_settle_merchant(&from, &token),
        Err(Ok(Error::NotInitialized))
    );
}

#[test]
fn record_sale_accumulates_and_requires_admin() {
    let (env, client, admin, merchant, _depositor, _token, _token_admin) = setup(250);

    client.record_sale(&merchant, &4_000);
    let auths = env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, admin);
    client.record_sale(&merchant, &6_000);

    assert_eq!(client.get_merchant_balance(&merchant), 10_000);
    assert_eq!(
        client.try_record_sale(&merchant, &0),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        client.try_record_sale(&merchant, &-1),
        Err(Ok(Error::InvalidAmount))
    );
}

#[test]
fn record_sale_without_admin_auth_is_rejected() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let merchant = Address::generate(&env);
    let contract_id = env.register(PartyPayEscrow, ());
    let client = PartyPayEscrowClient::new(&env, &contract_id);

    env.mock_auths(&[soroban_sdk::testutils::MockAuth {
        address: &admin,
        invoke: &soroban_sdk::testutils::MockAuthInvoke {
            contract: &contract_id,
            fn_name: "initialize",
            args: (&admin, 250_u32).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.initialize(&admin, &250);

    assert!(client.try_record_sale(&merchant, &1_000).is_err());
    assert_eq!(client.get_merchant_balance(&merchant), 0);
}

#[test]
fn settle_splits_two_and_a_half_percent_between_admin_and_merchant() {
    let (env, client, admin, merchant, depositor, token, token_admin) = setup(250);
    token_admin.mint(&depositor, &10_000);
    client.deposit(&depositor, &10_000, &token.address);
    client.record_sale(&merchant, &4_000);
    client.record_sale(&merchant, &6_000);

    client.settle_merchant(&merchant, &token.address);
    assert!(!env.auths().is_empty());

    // 10_000 * 250 / 10_000 = 250 de comisión; 9_750 para la barra.
    assert_eq!(token.balance(&admin), 250);
    assert_eq!(token.balance(&merchant), 9_750);
    assert_eq!(token.balance(&client.address), 0);
    assert_eq!(client.get_vault_balance(&token.address), 0);
    assert_eq!(client.get_merchant_balance(&merchant), 0);

    assert_eq!(
        client.try_settle_merchant(&merchant, &token.address),
        Err(Ok(Error::NothingToSettle))
    );
}

#[test]
fn settle_leaves_unallocated_vault_funds_in_custody() {
    let (_env, client, admin, merchant, depositor, token, token_admin) = setup(250);
    token_admin.mint(&depositor, &20_000);
    client.deposit(&depositor, &20_000, &token.address);
    client.record_sale(&merchant, &10_000);

    client.settle_merchant(&merchant, &token.address);

    assert_eq!(token.balance(&admin), 250);
    assert_eq!(token.balance(&merchant), 9_750);
    assert_eq!(token.balance(&client.address), 10_000);
    assert_eq!(client.get_vault_balance(&token.address), 10_000);
}

#[test]
fn settle_fails_when_the_vault_cannot_cover_the_claim() {
    let (_env, client, admin, merchant, depositor, token, token_admin) = setup(250);
    let other = Address::generate(&client.env);
    token_admin.mint(&depositor, &10_000);
    client.deposit(&depositor, &10_000, &token.address);
    client.record_sale(&merchant, &6_000);
    client.record_sale(&other, &6_000);

    client.settle_merchant(&merchant, &token.address);
    assert_eq!(
        client.try_settle_merchant(&other, &token.address),
        Err(Ok(Error::InsufficientVault))
    );

    // El primer pago se quedó hecho. El segundo reclamo no se tocó y el
    // resto de la bóveda sigue custodiado.
    assert_eq!(token.balance(&merchant), 5_850);
    assert_eq!(token.balance(&admin), 150);
    assert_eq!(token.balance(&other), 0);
    assert_eq!(client.get_merchant_balance(&other), 6_000);
    assert_eq!(client.get_vault_balance(&token.address), 4_000);
    assert_eq!(token.balance(&client.address), 4_000);
}

#[test]
fn settle_with_zero_fee_pays_the_merchant_the_whole_claim() {
    let (_env, client, admin, merchant, depositor, token, token_admin) = setup(0);
    token_admin.mint(&depositor, &5_000);
    client.deposit(&depositor, &5_000, &token.address);
    client.record_sale(&merchant, &5_000);

    client.settle_merchant(&merchant, &token.address);

    assert_eq!(token.balance(&merchant), 5_000);
    assert_eq!(token.balance(&admin), 0);
    assert_eq!(client.get_vault_balance(&token.address), 0);
}

#[test]
fn settle_with_full_fee_pays_only_the_admin() {
    let (_env, client, admin, merchant, depositor, token, token_admin) = setup(10_000);
    token_admin.mint(&depositor, &5_000);
    client.deposit(&depositor, &5_000, &token.address);
    client.record_sale(&merchant, &5_000);

    client.settle_merchant(&merchant, &token.address);

    assert_eq!(token.balance(&admin), 5_000);
    assert_eq!(token.balance(&merchant), 0);
    assert_eq!(client.get_merchant_balance(&merchant), 0);
}

#[test]
fn settle_of_one_unit_with_a_fractional_fee_pays_the_merchant() {
    let (_env, client, admin, merchant, depositor, token, token_admin) = setup(250);
    token_admin.mint(&depositor, &1);
    client.deposit(&depositor, &1, &token.address);
    client.record_sale(&merchant, &1);

    client.settle_merchant(&merchant, &token.address);

    // 1 * 250 / 10_000 = 0. No se emite un transfer de comisión en cero.
    assert_eq!(token.balance(&merchant), 1);
    assert_eq!(token.balance(&admin), 0);
}

#[test]
fn settle_draws_only_the_token_that_was_requested() {
    let (env, client, admin, merchant, depositor, usdc, usdc_admin) = setup(250);
    let rojos_issuer = Address::generate(&env);
    let (rojos, rojos_admin) = create_token(&env, &rojos_issuer);

    usdc_admin.mint(&depositor, &10_000);
    rojos_admin.mint(&depositor, &7_000);
    client.deposit(&depositor, &10_000, &usdc.address);
    client.deposit(&depositor, &7_000, &rojos.address);
    client.record_sale(&merchant, &7_000);

    client.settle_merchant(&merchant, &rojos.address);

    assert_eq!(rojos.balance(&merchant), 6_825);
    assert_eq!(rojos.balance(&admin), 175);
    assert_eq!(rojos.balance(&client.address), 0);
    assert_eq!(usdc.balance(&client.address), 10_000);
    assert_eq!(client.get_vault_balance(&usdc.address), 10_000);
    assert_eq!(client.get_vault_balance(&rojos.address), 0);
}

fn product_id(env: &Env, value: &str) -> String {
    String::from_str(env, value)
}

fn sale_line(env: &Env, value: &str, qty: u32) -> SaleLine {
    SaleLine {
        product_id: product_id(env, value),
        qty,
    }
}

fn one_line(env: &Env, value: &str, qty: u32) -> Vec<SaleLine> {
    let mut lines = Vec::new(env);
    lines.push_back(sale_line(env, value, qty));
    lines
}

#[test]
fn catalog_math_matches_the_menu_rules() {
    assert_eq!(payable_units(1, 0, 0), Ok(1));
    assert_eq!(payable_units(3, 2, 1), Ok(2));
    assert_eq!(payable_units(6, 2, 1), Ok(4));
    assert_eq!(payable_units(2, 2, 0), Ok(2));
    assert_eq!(payable_units(0, 2, 1), Err(Error::InvalidAmount));

    assert_eq!(line_gross(1_000, 4, 0), Ok(4_000));
    assert_eq!(line_gross(10_000, 1, 1_000), Ok(9_000));
    assert_eq!(line_gross(10_000, 1, 10_000), Ok(0));
    // 1 * 9_750 / 10_000 trunca a 0. No se cobra polvo.
    assert_eq!(line_gross(1, 1, 250), Ok(0));
    assert_eq!(line_gross(-1, 1, 0), Err(Error::InvalidAmount));
    assert_eq!(line_gross(1_000, 1, 10_001), Err(Error::InvalidPromo));
}

#[test]
fn sell_debits_stock_and_books_the_exact_gross() {
    let (env, client, _admin, merchant, _depositor, _token, _token_admin) = setup(250);
    let cola = product_id(&env, "cola");
    client.register_product(&merchant, &cola, &1_000, &10, &0, &0, &0);

    assert_eq!(client.sell(&merchant, &one_line(&env, "cola", 4)), 4_000);
    let after = client.get_product(&merchant, &cola).unwrap();
    assert_eq!(after.stock, 6);
    assert_eq!(after.sold, 4);
    assert_eq!(client.get_merchant_balance(&merchant), 4_000);

    assert_eq!(client.sell(&merchant, &one_line(&env, "cola", 6)), 6_000);
    let gone = client.get_product(&merchant, &cola).unwrap();
    assert_eq!(gone.stock, 0);
    assert_eq!(gone.sold, 10);
    assert_eq!(client.get_merchant_balance(&merchant), 10_000);

    assert_eq!(
        client.try_sell(&merchant, &one_line(&env, "cola", 1)),
        Err(Ok(Error::InsufficientStock))
    );
    assert_eq!(client.get_product(&merchant, &cola).unwrap().sold, 10);
    assert_eq!(client.get_merchant_balance(&merchant), 10_000);
}

#[test]
fn sell_of_a_short_line_does_not_move_the_other_product() {
    let (env, client, _admin, merchant, _depositor, _token, _token_admin) = setup(250);
    client.register_product(&merchant, &product_id(&env, "cola"), &1_000, &5, &0, &0, &0);
    client.register_product(&merchant, &product_id(&env, "agua"), &2_000, &1, &0, &0, &0);

    let mut lines = Vec::new(&env);
    lines.push_back(sale_line(&env, "cola", 2));
    lines.push_back(sale_line(&env, "agua", 2));
    assert_eq!(
        client.try_sell(&merchant, &lines),
        Err(Ok(Error::InsufficientStock))
    );

    assert_eq!(client.get_product(&merchant, &product_id(&env, "cola")).unwrap().stock, 5);
    assert_eq!(client.get_product(&merchant, &product_id(&env, "cola")).unwrap().sold, 0);
    assert_eq!(client.get_product(&merchant, &product_id(&env, "agua")).unwrap().stock, 1);
    assert_eq!(client.get_merchant_balance(&merchant), 0);
}

#[test]
fn sell_charges_the_promo_and_removes_every_unit_from_stock() {
    let (env, client, _admin, merchant, _depositor, _token, _token_admin) = setup(250);
    // Compra 2, lleva 1 gratis. 3 unidades pedidas, se cobran 2.
    client.register_product(&merchant, &product_id(&env, "cerveza"), &1_000, &3, &0, &2, &1);

    assert_eq!(client.sell(&merchant, &one_line(&env, "cerveza", 3)), 2_000);
    let item = client.get_product(&merchant, &product_id(&env, "cerveza")).unwrap();
    assert_eq!(item.stock, 0);
    assert_eq!(item.sold, 3);
    assert_eq!(client.get_merchant_balance(&merchant), 2_000);
}

#[test]
fn sell_applies_the_discount_before_booking_the_claim() {
    let (env, client, _admin, merchant, _depositor, _token, _token_admin) = setup(250);
    client.register_product(&merchant, &product_id(&env, "nachos"), &10_000, &4, &1_000, &0, &0);

    assert_eq!(client.sell(&merchant, &one_line(&env, "nachos", 1)), 9_000);
    assert_eq!(client.get_merchant_balance(&merchant), 9_000);
    assert_eq!(client.get_product(&merchant, &product_id(&env, "nachos")).unwrap().stock, 3);
}

#[test]
fn sell_then_settle_splits_two_and_a_half_percent_of_the_catalog_gross() {
    let (env, client, admin, merchant, depositor, token, token_admin) = setup(250);
    token_admin.mint(&depositor, &10_000);
    client.deposit(&depositor, &10_000, &token.address);
    client.register_product(&merchant, &product_id(&env, "cola"), &1_000, &10, &0, &0, &0);

    assert_eq!(client.sell(&merchant, &one_line(&env, "cola", 10)), 10_000);
    client.settle_merchant(&merchant, &token.address);

    // 10_000 * 250 / 10_000 = 250. El bruto es el del catálogo, no un monto aparte.
    assert_eq!(token.balance(&admin), 250);
    assert_eq!(token.balance(&merchant), 9_750);
    assert_eq!(client.get_merchant_balance(&merchant), 0);
    assert_eq!(client.get_product(&merchant, &product_id(&env, "cola")).unwrap().sold, 10);
    assert_eq!(client.get_product(&merchant, &product_id(&env, "cola")).unwrap().stock, 0);
}

#[test]
fn set_stock_restocks_without_erasing_units_sold() {
    let (env, client, _admin, merchant, _depositor, _token, _token_admin) = setup(250);
    let cola = product_id(&env, "cola");
    client.register_product(&merchant, &cola, &1_000, &2, &0, &0, &0);
    client.sell(&merchant, &one_line(&env, "cola", 1));
    client.set_stock(&merchant, &cola, &9);

    let item = client.get_product(&merchant, &cola).unwrap();
    assert_eq!(item.stock, 9);
    assert_eq!(item.sold, 1);
    assert_eq!(item.price, 1_000);

    client.update_offer(&merchant, &cola, &7_000, &true, &0, &0, &0);
    let repriced = client.get_product(&merchant, &cola).unwrap();
    assert_eq!(repriced.price, 7_000);
    assert_eq!(repriced.stock, 9);
    assert_eq!(repriced.sold, 1);
}

#[test]
fn sell_rejects_a_repeated_line_and_an_inactive_product() {
    let (env, client, _admin, merchant, _depositor, _token, _token_admin) = setup(250);
    let cola = product_id(&env, "cola");
    client.register_product(&merchant, &cola, &1_000, &5, &0, &0, &0);

    let mut lines = Vec::new(&env);
    lines.push_back(sale_line(&env, "cola", 1));
    lines.push_back(sale_line(&env, "cola", 1));
    assert_eq!(
        client.try_sell(&merchant, &lines),
        Err(Ok(Error::DuplicateLine))
    );
    assert_eq!(client.get_product(&merchant, &cola).unwrap().stock, 5);

    client.update_offer(&merchant, &cola, &1_000, &false, &0, &0, &0);
    assert_eq!(
        client.try_sell(&merchant, &one_line(&env, "cola", 1)),
        Err(Ok(Error::InactiveProduct))
    );
    assert_eq!(client.get_merchant_balance(&merchant), 0);
}

#[test]
fn register_product_rejects_bad_catalog_rows() {
    let (env, client, _admin, merchant, _depositor, _token, _token_admin) = setup(250);
    let cola = product_id(&env, "cola");
    client.register_product(&merchant, &cola, &1_000, &5, &0, &0, &0);

    assert_eq!(
        client.try_register_product(&merchant, &cola, &1_000, &5, &0, &0, &0),
        Err(Ok(Error::DuplicateProduct))
    );
    assert_eq!(
        client.try_register_product(&merchant, &String::from_str(&env, ""), &1_000, &1, &0, &0, &0),
        Err(Ok(Error::InvalidProductId))
    );
    assert_eq!(
        client.try_register_product(&merchant, &product_id(&env, "agua"), &-1, &1, &0, &0, &0),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        client.try_register_product(&merchant, &product_id(&env, "agua"), &1_000, &1, &10_001, &0, &0),
        Err(Ok(Error::InvalidPromo))
    );
    assert_eq!(
        client.try_sell(&merchant, &Vec::new(&env)),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(client.get_product(&merchant, &cola).unwrap().stock, 5);
}

#[test]
fn a_free_sale_moves_stock_and_does_not_open_a_zero_claim() {
    let (env, client, _admin, merchant, _depositor, _token, _token_admin) = setup(250);
    client.register_product(&merchant, &product_id(&env, "muestra"), &1, &2, &250, &0, &0);

    assert_eq!(client.sell(&merchant, &one_line(&env, "muestra", 1)), 0);
    let item = client.get_product(&merchant, &product_id(&env, "muestra")).unwrap();
    assert_eq!(item.stock, 1);
    assert_eq!(item.sold, 1);
    assert_eq!(client.get_merchant_balance(&merchant), 0);
}

#[test]
fn sell_without_admin_auth_is_rejected() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let merchant = Address::generate(&env);
    let contract_id = env.register(PartyPayEscrow, ());
    let client = PartyPayEscrowClient::new(&env, &contract_id);

    env.mock_auths(&[soroban_sdk::testutils::MockAuth {
        address: &admin,
        invoke: &soroban_sdk::testutils::MockAuthInvoke {
            contract: &contract_id,
            fn_name: "initialize",
            args: (&admin, 250_u32).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.initialize(&admin, &250);

    assert!(client.try_sell(&merchant, &one_line(&env, "cola", 1)).is_err());
    assert_eq!(client.get_merchant_balance(&merchant), 0);
    assert_eq!(
        client.get_product(&merchant, &product_id(&env, "cola")),
        None
    );
}

#[test]
fn settle_pays_the_event_treasury_the_configured_percent() {
    let (env, client, admin, merchant, depositor, token, token_admin) = setup(250);
    let treasury = Address::generate(&env);
    let stranger = Address::generate(&env);
    client.set_event_fee(&merchant, &merchant, &1_000, &treasury);
    assert_eq!(
        client.try_set_event_fee(&stranger, &merchant, &1_000, &treasury),
        Err(Ok(Error::NotAuthorized))
    );

    token_admin.mint(&depositor, &10_000);
    client.deposit(&depositor, &10_000, &token.address);
    client.register_product(&merchant, &product_id(&env, "cola"), &1_000, &10, &0, &0, &0);
    client.sell(&merchant, &one_line(&env, "cola", 10));
    client.settle_merchant(&merchant, &token.address);

    assert_eq!(token.balance(&treasury), 1_000);
    assert_eq!(token.balance(&merchant), 9_000);
    assert_eq!(token.balance(&admin), 0);
    assert_eq!(client.get_event_fee(&merchant).unwrap().fee_bps, 1_000);
}

#[test]
fn checkout_collects_the_gross_and_splits_it_in_one_call() {
    let (env, client, admin, merchant, customer, token, token_admin) = setup(250);
    let treasury = Address::generate(&env);
    client.set_event_fee(&admin, &merchant, &250, &treasury);
    token_admin.mint(&customer, &10_000);
    client.register_product(&merchant, &product_id(&env, "birra"), &1_000, &9, &0, &0, &0);

    assert_eq!(
        client.checkout(&customer, &merchant, &token.address, &one_line(&env, "birra", 1)),
        1_000
    );

    assert_eq!(token.balance(&customer), 9_000);
    assert_eq!(token.balance(&treasury), 25);
    assert_eq!(token.balance(&merchant), 975);
    assert_eq!(token.balance(&client.address), 0);
    assert_eq!(client.get_merchant_balance(&merchant), 0);
    assert_eq!(client.get_vault_balance(&token.address), 0);
    let item = client.get_product(&merchant, &product_id(&env, "birra")).unwrap();
    assert_eq!(item.stock, 8);
    assert_eq!(item.sold, 1);

    assert!(client
        .try_checkout(&customer, &merchant, &token.address, &one_line(&env, "birra", 9))
        .is_err());
    assert_eq!(
        client.get_product(&merchant, &product_id(&env, "birra")).unwrap().stock,
        8
    );
}
