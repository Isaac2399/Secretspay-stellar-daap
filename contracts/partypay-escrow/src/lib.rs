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
//!    token con el que después se va a liquidar. El administrador del evento
//!    es la fuente de esas anotaciones: el contrato no ve los pedidos del
//!    menú, solo impide pagar de más y aplica el split.
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
    Address, Env,
};

/// 100 % expresado en puntos básicos. 250 = 2,5 %.
const MAX_FEE_BPS: u32 = 10_000;
const BPS_DENOMINATOR: i128 = 10_000;

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

        let escrow = env.current_contract_address();
        let token_client = TokenClient::new(&env, &token);
        let before = token_client.balance(&escrow);
        token_client.transfer(&from, &escrow, &amount);
        let after = token_client.balance(&escrow);
        let received = after.checked_sub(before).ok_or(Error::Overflow)?;
        if received != amount {
            return Err(Error::DepositMismatch);
        }

        let key = DataKey::VaultBalance(token.clone());
        let vault = vault_balance(&env, &token)
            .checked_add(amount)
            .ok_or(Error::Overflow)?;
        env.storage().persistent().set(&key, &vault);
        bump_instance(&env);
        bump_persistent(&env, &key);

        Deposited {
            from,
            token,
            amount,
            vault_balance: vault,
        }
        .publish(&env);
        Ok(())
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

    /// Paga el reclamo completo de un comercio con el token indicado.
    ///
    /// Es todo o nada: si la bóveda no cubre el bruto, no se paga una parte y
    /// el reclamo sigue igual. El estado se actualiza antes de las transferencias
    /// (el bruto sale del libro y de la bóveda). Si un `transfer` falla, Soroban
    /// revierte también esas escrituras, así que no puede quedar un pago a
    /// medias. La comisión se envía al `admin` y el neto al `merchant`. Un tramo
    /// de cero —comisión 0 % o 100 %— no se transfiere, porque SEP-41 rechaza
    /// montos no positivos.
    pub fn settle_merchant(env: Env, merchant: Address, token: Address) -> Result<(), Error> {
        let admin = require_admin(&env)?;
        admin.require_auth();

        let gross = merchant_balance(&env, &merchant);
        if gross <= 0 {
            return Err(Error::NothingToSettle);
        }

        let fee_bps = fee_bps(&env)?;
        let (fee, net) = split_fee(gross, fee_bps)?;
        // El split tiene que cerrar. Si no, no se toca la bóveda.
        if fee.checked_add(net).ok_or(Error::Overflow)? != gross {
            return Err(Error::Overflow);
        }

        let vault = vault_balance(&env, &token);
        let on_chain = TokenClient::new(&env, &token).balance(&env.current_contract_address());
        // Las dos cifras tienen que alcanzar: el libro interno y los tokens
        // que el contrato tiene de verdad. Así un descuadre no se puede pagar.
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
            bump_persistent(&env, &vault_key);
        }
        bump_instance(&env);

        MerchantSettled {
            merchant: merchant.clone(),
            token: token.clone(),
            gross,
            fee,
            net,
        }
        .publish(&env);

        // El contrato transfiere sus propios tokens. Esa autorización es implícita
        // para la llamada directa; el admin solo autoriza `settle_merchant`.
        let escrow = env.current_contract_address();
        let token_client = TokenClient::new(&env, &token);
        if fee > 0 {
            token_client.transfer(&escrow, &admin, &fee);
        }
        if net > 0 {
            token_client.transfer(&escrow, &merchant, &net);
        }
        Ok(())
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
