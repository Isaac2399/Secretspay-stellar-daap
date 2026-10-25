#![cfg(test)]

extern crate std;

use soroban_sdk::{
    testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation},
    token, Address, Env, IntoVal, Symbol,
};

use crate::{split_fee, Error, PartyPayEscrow, PartyPayEscrowClient};

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
