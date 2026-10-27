//! Fideicomiso de evento y liquidación de barras para PartyPay.
//!
//! El contrato separa dos libros que no deben confundirse:
//!
//! 1. **Custodia (`VaultBalance`)**. Los tokens SEP-41 (el SAC de USDC o el de
//!    ROJOS) se transfieren a la dirección de este contrato solo mediante
//!    `deposit`. Esa entrada es la bóveda del evento: el contrato es el único
//!    dueño de esos saldos hasta que `settle_merchant` los reparte.
//! 2. **Reclamo (`MerchantBalance`)**. `record_sale` no mueve tokens. Anota
//!    cuánto tiene pendiente de cobro un comercio, en la unidad mínima del
//!    token con el que después se va a liquidar. `sell` hace esa misma
//!    anotación, pero el bruto lo calcula el contrato a partir del catálogo:
//!    descuenta stock y, si una línea no alcanza, no anota nada.
//! 3. **Inventario (`Product`)**. Cada producto guarda unidades restantes y
//!    unidades ya vendidas. El stock baja por las unidades pedidas (también
//!    las de una promo) y el reclamo sube por el precio cobrable. Así no se
//!    puede vender de más y el reclamo cuadra con el menú.
//! 4. **Cobro (`checkout`)**. En una sola llamada descuenta el stock, deposita
//!    el bruto del cliente y liquida ese reclamo. Si algo no cuadra, no se
//!    mueve ni el inventario ni los tokens.
//!
//! En la liquidación el bruto del comercio se parte on-chain:
//!
//! ```text
//! fee = bruto * fee_bps / 10_000     (división entera, el resto queda al comercio)
//! neto = bruto - fee
//! ```
//!
//! `fee_bps` está en puntos básicos (250 = 2,5 %). La comisión va al `admin`
//! y el neto al `merchant`. Ningún pago puede superar el saldo custodiado del
//! token elegido: si la bóveda no alcanza, la liquidación entera se revierte.
//!
//! Los montos son `i128` (SEP-41) y se expresan en la unidad mínima del token
//! (por ejemplo, 10_000_000 = 1 USDC si el asset tiene 7 decimales).

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token::TokenClient,
    Address, Env, String, Vec,
};

/// 100 % expresado en puntos básicos. 250 = 2,5 %.
const MAX_FEE_BPS: u32 = 10_000;
const BPS_DENOMINATOR: i128 = 10_000;
/// Tope del id de producto (el UUID del menú cabe).
const MAX_PRODUCT_ID_LEN: u32 = 64;
/// Líneas por venta. Un pedido de barra no necesita más, y acota el costo.
const MAX_SALE_LINES: u32 = 32;

/// ~5 s por ledger en mainnet. El TTL se mide en ledgers, no en segundos.
const DAY_IN_LEDGERS: u32 = 17_280;
/// Por debajo de este umbral, la escritura renueva el alquiler del estado.
const BUMP_THRESHOLD: u32 = 30 * DAY_IN_LEDGERS;
/// Hasta dónde se extiende el TTL (tope práctico de mainnet: ~180 días).
const BUMP_TO: u32 = 120 * DAY_IN_LEDGERS;

/// Claves de almacenamiento. Cada variante es un ledger entry distinto para
/// que la liquidación de un comercio no serialice la de otro.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Operador del evento. También es quien cobra `fee_bps`.
    Admin,
    /// Comisión fija de la plataforma, fijada en `initialize`.
    FeeBps,
    /// Reclamo pendiente del comercio. No es un saldo de token.
    MerchantBalance(Address),
    /// Tokens custodiados por este contrato para un contrato SEP-41.
    VaultBalance(Address),
    /// Catálogo de un comercio. La clave incluye al comercio para que una
    /// barra no venda el stock de otra.
    Product(Address, String),
    /// Comisión de un comercio: tasa y cuenta que la cobra en la liquidación.
    EventFee(Address),
}

/// Comisión de un evento. `fee_bps` usa la misma escala que la global
/// (250 = 2,5 %). `treasury` recibe esa parte al liquidar.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EventFee {
    pub fee_bps: u32,
    pub treasury: Address,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    /// `fee_bps` mayor que 10_000 (más del 100 %).
    InvalidFee = 3,
    /// Monto cero o negativo. Un `i128` negativo invertiría el flujo.
    InvalidAmount = 4,
    /// La bóveda de ese token no cubre el bruto del comercio.
    InsufficientVault = 5,
    /// El comercio no tiene un reclamo pendiente.
    NothingToSettle = 6,
    Overflow = 7,
    /// El token no acreditó en la bóveda el monto exacto que se pidió depositar.
    DepositMismatch = 8,
    /// Descuento o promo fuera de rango.
    InvalidPromo = 9,
    /// La línea pide más unidades de las que quedan.
    InsufficientStock = 10,
    /// No hay un producto con ese id para ese comercio.
    ProductNotFound = 11,
    /// El producto existe, pero no se puede vender.
    InactiveProduct = 12,
    /// Ya hay un producto con ese id para ese comercio.
    DuplicateProduct = 13,
    /// La misma venta repite un producto. Hay que sumar la cantidad en una línea.
    DuplicateLine = 14,
    /// Id vacío o más largo que 64 bytes.
    InvalidProductId = 15,
    /// Quien llama no es el admin del contrato ni el comercio de esa regla.
    NotAuthorized = 16,
}

/// Una línea de venta. `qty` son unidades que salen del inventario.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SaleLine {
    pub product_id: String,
    pub qty: u32,
}

/// Existencias de un producto. `stock` es lo que aún se puede vender.
/// `sold` solo sube en `sell` y no se reinicia al reponer.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Product {
    pub price: i128,
    pub stock: u32,
    pub sold: u32,
    pub active: bool,
    /// 0 = sin descuento. 10_000 = gratis. Misma escala que `fee_bps`.
    pub discount_bps: u32,
    /// Promo "lleva N y te regalamos M". Cero en cualquiera de los dos la apaga.
    pub buy_qty: u32,
    pub get_qty: u32,
}

/// Parte un bruto ya validado (`> 0`) con una tasa ya validada (`<= 10_000`).
///
/// La división entera trunca hacia cero, así que el polvo de los puntos básicos
/// se queda en el neto del comercio y la plataforma no cobra de más.
pub(crate) fn split_fee(gross: i128, fee_bps: u32) -> Result<(i128, i128), Error> {
    if gross <= 0 {
        return Err(Error::InvalidAmount);
    }
    if fee_bps > MAX_FEE_BPS {
        return Err(Error::InvalidFee);
    }

    let fee = gross
        .checked_mul(i128::from(fee_bps))
        .ok_or(Error::Overflow)?
        / BPS_DENOMINATOR;
    let net = gross.checked_sub(fee).ok_or(Error::Overflow)?;
    Ok((fee, net))
}

/// Unidades que se cobran. La promo "compra N, lleva M gratis" regala
/// `get_qty` de cada grupo `buy_qty + get_qty`. Si uno de los dos es cero,
/// se cobra todo. El inventario igual descuenta las unidades pedidas.
pub(crate) fn payable_units(qty: u32, buy_qty: u32, get_qty: u32) -> Result<u32, Error> {
    if qty == 0 {
        return Err(Error::InvalidAmount);
    }
    if buy_qty == 0 || get_qty == 0 {
        return Ok(qty);
    }
    let group = buy_qty.checked_add(get_qty).ok_or(Error::Overflow)?;
    let free = (qty / group)
        .checked_mul(get_qty)
        .ok_or(Error::Overflow)?;
    qty.checked_sub(free).ok_or(Error::Overflow)
}

/// Bruto de una línea en unidad mínima. La división entera trunca hacia cero,
/// igual que la comisión: el polvo no se cobra.
pub(crate) fn line_gross(price: i128, payable: u32, discount_bps: u32) -> Result<i128, Error> {
    if price < 0 {
        return Err(Error::InvalidAmount);
    }
    if discount_bps > MAX_FEE_BPS {
        return Err(Error::InvalidPromo);
    }
    if payable == 0 || price == 0 || discount_bps == MAX_FEE_BPS {
        return Ok(0);
    }
    let net_bps = i128::from(MAX_FEE_BPS - discount_bps);
    Ok(price
        .checked_mul(i128::from(payable))
        .ok_or(Error::Overflow)?
        .checked_mul(net_bps)
        .ok_or(Error::Overflow)?
        / BPS_DENOMINATOR)
}

#[contractevent]
pub struct Deposited {
    #[topic]
    pub from: Address,
    #[topic]
    pub token: Address,
    pub amount: i128,
    pub vault_balance: i128,
}

#[contractevent]
pub struct SaleRecorded {
    #[topic]
    pub merchant: Address,
    pub amount: i128,
    pub pending: i128,
}

/// Venta descontada del catálogo. `gross` es el mismo número que entra al reclamo.
#[contractevent]
pub struct InventorySold {
    #[topic]
    pub merchant: Address,
    pub gross: i128,
    pub units: u32,
}

/// Split aplicado. `gross = fee + net` y ambos salieron de la bóveda.
#[contractevent]
pub struct MerchantSettled {
    #[topic]
    pub merchant: Address,
    #[topic]
    pub token: Address,
    pub gross: i128,
    pub fee: i128,
    pub net: i128,
}

#[contract]
pub struct PartyPayEscrow;

#[contractimpl]
impl PartyPayEscrow {
    /// Fija al operador del evento y la comisión. Solo puede ejecutarse una vez.
    ///
    /// `admin` tiene que firmar: nadie puede nombrar administrador a un tercero
    /// sin su autorización. Quien despliegue el contrato debe invocar esto en
    /// seguida; si otra cuenta inicializa antes, el contrato queda tomado.
    pub fn initialize(env: Env, admin: Address, fee_bps: u32) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        if fee_bps > MAX_FEE_BPS {
            return Err(Error::InvalidFee);
        }

        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
        bump_instance(&env);
        Ok(())
    }

    /// Mete tokens en la bóveda compartida del evento.
    ///
    /// `from` puede ser un asistente o el propio operador. El token (dirección
    /// del SAC de USDC, de ROJOS, u otro SEP-41) se transfiere a este contrato.
    /// El libro interno solo sube si el saldo real del contrato sube exactamente
    /// `amount`: un token con comisión o una transferencia que no acredita se
    /// rechaza y toda la transacción se revierte.
    ///
    /// Una transferencia hecha directo al contrato, sin pasar por aquí, no crea
    /// saldo liquidable. Esos tokens no entran en `VaultBalance`.
    pub fn deposit(env: Env, from: Address, amount: i128, token: Address) -> Result<(), Error> {
        ensure_initialized(&env)?;
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        // La firma de `from` cubre esta llamada y, como sub-invocación, el
        // `transfer` del token. Sin este `require_auth` el depósito no quedaría
        // atado a la intención de fondear la bóveda.
        from.require_auth();
        deposit_into(&env, &from, amount, &token)
    }

    /// Acumula una venta del comercio. No mueve tokens.
    ///
    /// Solo el `admin` guardado puede anotarla. Si cualquiera pudiera sumar
    /// reclamos, se liquidarían contra la bóveda y el fideicomiso se vaciaría.
    /// El monto tiene que estar denominado en el token con el que luego se
    /// llame a `settle_merchant`: el reclamo es un solo número por comercio,
    /// no un saldo por token.
    pub fn record_sale(env: Env, merchant: Address, amount: i128) -> Result<(), Error> {
        let admin = require_admin(&env)?;
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        admin.require_auth();

        let key = DataKey::MerchantBalance(merchant.clone());
        let pending = merchant_balance(&env, &merchant)
            .checked_add(amount)
            .ok_or(Error::Overflow)?;
        env.storage().persistent().set(&key, &pending);
        bump_instance(&env);
        bump_persistent(&env, &key);

        SaleRecorded {
            merchant,
            amount,
            pending,
        }
        .publish(&env);
        Ok(())
    }

    /// Da de alta un producto. El stock inicial es lo que se puede vender.
    /// `sold` empieza en cero. Solo el admin puede escribir el catálogo.
    pub fn register_product(
        env: Env,
        merchant: Address,
        product_id: String,
        price: i128,
        stock: u32,
        discount_bps: u32,
        buy_qty: u32,
        get_qty: u32,
    ) -> Result<(), Error> {
        let admin = require_admin(&env)?;
        admin.require_auth();
        validate_product_id(&product_id)?;
        validate_offer(price, discount_bps, buy_qty, get_qty)?;

        let key = product_key(&merchant, &product_id);
        if env.storage().persistent().has(&key) {
            return Err(Error::DuplicateProduct);
        }
        save_product(
            &env,
            &key,
            &Product {
                price,
                stock,
                sold: 0,
                active: true,
                discount_bps,
                buy_qty,
                get_qty,
            },
        );
        Ok(())
    }

    /// Cambia precio, promo o si se puede vender. No toca `stock` ni `sold`.
    pub fn update_offer(
        env: Env,
        merchant: Address,
        product_id: String,
        price: i128,
        active: bool,
        discount_bps: u32,
        buy_qty: u32,
        get_qty: u32,
    ) -> Result<(), Error> {
        let admin = require_admin(&env)?;
        admin.require_auth();
        validate_product_id(&product_id)?;
        validate_offer(price, discount_bps, buy_qty, get_qty)?;

        let key = product_key(&merchant, &product_id);
        let mut product = load_product(&env, &key).ok_or(Error::ProductNotFound)?;
        product.price = price;
        product.active = active;
        product.discount_bps = discount_bps;
        product.buy_qty = buy_qty;
        product.get_qty = get_qty;
        save_product(&env, &key, &product);
        Ok(())
    }

    /// Repone o corrige las unidades restantes. `sold` sigue siendo el
    /// histórico de lo que ya salió por `sell`.
    pub fn set_stock(
        env: Env,
        merchant: Address,
        product_id: String,
        stock: u32,
    ) -> Result<(), Error> {
        let admin = require_admin(&env)?;
        admin.require_auth();
        validate_product_id(&product_id)?;

        let key = product_key(&merchant, &product_id);
        let mut product = load_product(&env, &key).ok_or(Error::ProductNotFound)?;
        product.stock = stock;
        save_product(&env, &key, &product);
        Ok(())
    }

    /// Vende las líneas o no vende ninguna.
    ///
    /// El bruto que se anota al comercio es la suma del catálogo, no un monto
    /// que el llamador elige. El stock baja por `qty` (salen también las
    /// unidades gratis). Si el bruto es cero —producto gratis o descuento
    /// total— el inventario igual se mueve y no se crea un reclamo de cero.
    pub fn sell(env: Env, merchant: Address, lines: Vec<SaleLine>) -> Result<i128, Error> {
        let admin = require_admin(&env)?;
        admin.require_auth();
        apply_sale(&env, &merchant, &lines)
    }

    /// Cobra un pedido en una sola transacción.
    ///
    /// El admin autoriza el catálogo y el cliente autoriza el depósito del
    /// bruto. El stock baja, el bruto entra a la bóveda y sale partido entre
    /// la cuenta del evento y el comercio. Si el cliente no puede pagar, o el
    /// stock no alcanza, no queda ni el descuento ni el depósito.
    pub fn checkout(
        env: Env,
        customer: Address,
        merchant: Address,
        token: Address,
        lines: Vec<SaleLine>,
    ) -> Result<i128, Error> {
        ensure_initialized(&env)?;
        let admin = require_admin(&env)?;
        admin.require_auth();
        customer.require_auth();

        let gross = apply_sale(&env, &merchant, &lines)?;
        if gross == 0 {
            return Ok(0);
        }
        deposit_into(&env, &customer, gross, &token)?;
        settle_open_claim(&env, &admin, &merchant, &token)?;
        Ok(gross)
    }

    pub fn get_product(env: Env, merchant: Address, product_id: String) -> Option<Product> {
        ensure_initialized(&env).ok()?;
        validate_product_id(&product_id).ok()?;
        bump_instance(&env);
        let key = product_key(&merchant, &product_id);
        if env.storage().persistent().has(&key) {
            bump_persistent(&env, &key);
        }
        load_product(&env, &key)
    }

    /// Paga el reclamo completo de un comercio con el token indicado.
    ///
    /// Es todo o nada: si la bóveda no cubre el bruto, no se paga una parte y
    /// el reclamo sigue igual. El estado se actualiza antes de las transferencias
    /// (el bruto sale del libro y de la bóveda). Si un `transfer` falla, Soroban
    /// revierte también esas escrituras, así que no puede quedar un pago a
    /// medias. La comisión se envía a la cuenta del evento, o al `admin` si
    /// ese comercio no tiene una, y el neto al `merchant`. Un tramo
    /// de cero —comisión 0 % o 100 %— no se transfiere, porque SEP-41 rechaza
    /// montos no positivos.
    pub fn settle_merchant(env: Env, merchant: Address, token: Address) -> Result<(), Error> {
        let admin = require_admin(&env)?;
        admin.require_auth();
        settle_open_claim(&env, &admin, &merchant, &token)
    }

    /// Reclamo pendiente de liquidación, en unidades mínimas. Cero si no hay venta.
    pub fn get_merchant_balance(env: Env, merchant: Address) -> i128 {
        bump_instance(&env);
        let key = DataKey::MerchantBalance(merchant.clone());
        if env.storage().persistent().has(&key) {
            bump_persistent(&env, &key);
        }
        merchant_balance(&env, &merchant)
    }

    /// Saldo custodiado según el libro interno (no el `balance` crudo del token).
    pub fn get_vault_balance(env: Env, token: Address) -> i128 {
        bump_instance(&env);
        let key = DataKey::VaultBalance(token.clone());
        if env.storage().persistent().has(&key) {
            bump_persistent(&env, &key);
        }
        vault_balance(&env, &token)
    }

    pub fn get_admin(env: Env) -> Option<Address> {
        bump_instance(&env);
        env.storage().instance().get(&DataKey::Admin)
    }

    pub fn get_fee_bps(env: Env) -> Option<u32> {
        bump_instance(&env);
        env.storage().instance().get(&DataKey::FeeBps)
    }

    /// Fija la comisión de un comercio y la cuenta que la recibe.
    ///
    /// Puede firmar el admin del contrato o el propio comercio. La cuenta
    /// destino no firma: solo recibe. Si no hay regla, la liquidación usa
    /// la comisión global y paga al admin.
    pub fn set_event_fee(
        env: Env,
        caller: Address,
        merchant: Address,
        fee_bps: u32,
        treasury: Address,
    ) -> Result<(), Error> {
        ensure_initialized(&env)?;
        if fee_bps > MAX_FEE_BPS {
            return Err(Error::InvalidFee);
        }
        caller.require_auth();
        let admin = require_admin(&env)?;
        if caller != admin && caller != merchant {
            return Err(Error::NotAuthorized);
        }
        let key = DataKey::EventFee(merchant);
        env.storage()
            .persistent()
            .set(&key, &EventFee { fee_bps, treasury });
        bump_persistent(&env, &key);
        bump_instance(&env);
        Ok(())
    }

    pub fn get_event_fee(env: Env, merchant: Address) -> Option<EventFee> {
        ensure_initialized(&env).ok()?;
        bump_instance(&env);
        let key = DataKey::EventFee(merchant);
        if env.storage().persistent().has(&key) {
            bump_persistent(&env, &key);
        }
        env.storage().persistent().get(&key)
    }
}

fn ensure_initialized(env: &Env) -> Result<(), Error> {
    if env.storage().instance().has(&DataKey::Admin) {
        Ok(())
    } else {
        Err(Error::NotInitialized)
    }
}

fn require_admin(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(Error::NotInitialized)
}

fn fee_bps(env: &Env) -> Result<u32, Error> {
    env.storage()
        .instance()
        .get(&DataKey::FeeBps)
        .ok_or(Error::NotInitialized)
}

fn deposit_into(env: &Env, from: &Address, amount: i128, token: &Address) -> Result<(), Error> {
    let escrow = env.current_contract_address();
    let token_client = TokenClient::new(env, token);
    let before = token_client.balance(&escrow);
    token_client.transfer(from, &escrow, &amount);
    let after = token_client.balance(&escrow);
    let received = after.checked_sub(before).ok_or(Error::Overflow)?;
    if received != amount {
        return Err(Error::DepositMismatch);
    }

    let key = DataKey::VaultBalance(token.clone());
    let vault = vault_balance(env, token)
        .checked_add(amount)
        .ok_or(Error::Overflow)?;
    env.storage().persistent().set(&key, &vault);
    bump_instance(env);
    bump_persistent(env, &key);

    Deposited {
        from: from.clone(),
        token: token.clone(),
        amount,
        vault_balance: vault,
    }
    .publish(env);
    Ok(())
}

fn apply_sale(env: &Env, merchant: &Address, lines: &Vec<SaleLine>) -> Result<i128, Error> {
    if lines.is_empty() || lines.len() > MAX_SALE_LINES {
        return Err(Error::InvalidAmount);
    }

    let mut seen: Vec<String> = Vec::new(env);
    let mut gross: i128 = 0;
    let mut units: u32 = 0;
    for line in lines.iter() {
        quote_line(env, merchant, &line, &seen)?;
        seen.push_back(line.product_id.clone());
        let key = product_key(merchant, &line.product_id);
        let product = load_product(env, &key).ok_or(Error::ProductNotFound)?;
        let payable = payable_units(line.qty, product.buy_qty, product.get_qty)?;
        let line_amount = line_gross(product.price, payable, product.discount_bps)?;
        gross = gross.checked_add(line_amount).ok_or(Error::Overflow)?;
        units = units.checked_add(line.qty).ok_or(Error::Overflow)?;
    }

    for line in lines.iter() {
        let key = product_key(merchant, &line.product_id);
        let mut product = load_product(env, &key).ok_or(Error::ProductNotFound)?;
        product.stock = product.stock.checked_sub(line.qty).ok_or(Error::Overflow)?;
        product.sold = product.sold.checked_add(line.qty).ok_or(Error::Overflow)?;
        save_product(env, &key, &product);
    }

    InventorySold {
        merchant: merchant.clone(),
        gross,
        units,
    }
    .publish(env);

    if gross > 0 {
        let balance_key = DataKey::MerchantBalance(merchant.clone());
        let pending = merchant_balance(env, merchant)
            .checked_add(gross)
            .ok_or(Error::Overflow)?;
        env.storage().persistent().set(&balance_key, &pending);
        bump_persistent(env, &balance_key);
        SaleRecorded {
            merchant: merchant.clone(),
            amount: gross,
            pending,
        }
        .publish(env);
    }
    Ok(gross)
}

fn settle_open_claim(
    env: &Env,
    admin: &Address,
    merchant: &Address,
    token: &Address,
) -> Result<(), Error> {
    let gross = merchant_balance(env, merchant);
    if gross <= 0 {
        return Err(Error::NothingToSettle);
    }

    let rule = event_fee(env, merchant);
    let fee_bps = match &rule {
        Some(rule) => rule.fee_bps,
        None => fee_bps(env)?,
    };
    let (fee, net) = split_fee(gross, fee_bps)?;
    if fee.checked_add(net).ok_or(Error::Overflow)? != gross {
        return Err(Error::Overflow);
    }

    let vault = vault_balance(env, token);
    let on_chain = TokenClient::new(env, token).balance(&env.current_contract_address());
    if vault < gross || on_chain < gross {
        return Err(Error::InsufficientVault);
    }

    let merchant_key = DataKey::MerchantBalance(merchant.clone());
    let vault_key = DataKey::VaultBalance(token.clone());
    env.storage().persistent().remove(&merchant_key);
    let vault_after = vault.checked_sub(gross).ok_or(Error::Overflow)?;
    if vault_after == 0 {
        env.storage().persistent().remove(&vault_key);
    } else {
        env.storage().persistent().set(&vault_key, &vault_after);
        bump_persistent(env, &vault_key);
    }
    bump_instance(env);

    MerchantSettled {
        merchant: merchant.clone(),
        token: token.clone(),
        gross,
        fee,
        net,
    }
    .publish(env);

    let treasury = match &rule {
        Some(rule) => rule.treasury.clone(),
        None => admin.clone(),
    };
    let escrow = env.current_contract_address();
    let token_client = TokenClient::new(env, token);
    if fee > 0 {
        token_client.transfer(&escrow, &treasury, &fee);
    }
    if net > 0 {
        token_client.transfer(&escrow, merchant, &net);
    }
    Ok(())
}

fn event_fee(env: &Env, merchant: &Address) -> Option<EventFee> {
    env.storage()
        .persistent()
        .get(&DataKey::EventFee(merchant.clone()))
}


fn validate_product_id(product_id: &String) -> Result<(), Error> {
    let len = product_id.len();
    if len == 0 || len > MAX_PRODUCT_ID_LEN {
        return Err(Error::InvalidProductId);
    }
    Ok(())
}

fn validate_offer(price: i128, discount_bps: u32, buy_qty: u32, get_qty: u32) -> Result<(), Error> {
    if price < 0 {
        return Err(Error::InvalidAmount);
    }
    if discount_bps > MAX_FEE_BPS {
        return Err(Error::InvalidPromo);
    }
    if buy_qty.checked_add(get_qty).is_none() {
        return Err(Error::Overflow);
    }
    Ok(())
}

fn product_key(merchant: &Address, product_id: &String) -> DataKey {
    DataKey::Product(merchant.clone(), product_id.clone())
}

fn load_product(env: &Env, key: &DataKey) -> Option<Product> {
    env.storage().persistent().get(key)
}

fn save_product(env: &Env, key: &DataKey, product: &Product) {
    env.storage().persistent().set(key, product);
    bump_instance(env);
    bump_persistent(env, key);
}

fn already_seen(seen: &Vec<String>, product_id: &String) -> bool {
    for seen_id in seen.iter() {
        if seen_id == product_id.clone() {
            return true;
        }
    }
    false
}

/// Rechaza una línea que no se puede vender. No escribe almacenamiento.
fn quote_line(
    env: &Env,
    merchant: &Address,
    line: &SaleLine,
    seen: &Vec<String>,
) -> Result<(), Error> {
    if line.qty == 0 {
        return Err(Error::InvalidAmount);
    }
    validate_product_id(&line.product_id)?;
    if already_seen(seen, &line.product_id) {
        return Err(Error::DuplicateLine);
    }
    let product = load_product(env, &product_key(merchant, &line.product_id))
        .ok_or(Error::ProductNotFound)?;
    if !product.active {
        return Err(Error::InactiveProduct);
    }
    if product.stock < line.qty {
        return Err(Error::InsufficientStock);
    }
    Ok(())
}

fn merchant_balance(env: &Env, merchant: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::MerchantBalance(merchant.clone()))
        .unwrap_or(0)
}

fn vault_balance(env: &Env, token: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::VaultBalance(token.clone()))
        .unwrap_or(0)
}

fn bump_instance(env: &Env) {
    env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_TO);
}

fn bump_persistent(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, BUMP_THRESHOLD, BUMP_TO);
}

#[cfg(test)]
mod test;
