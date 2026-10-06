//! Authenticated encryption. The wrapping key is a server secret, never a DB row.
use super::{CloudError, CloudResult};
use base64::{Engine, engine::general_purpose::STANDARD};
use ring::{
    aead,
    rand::{SecureRandom, SystemRandom},
};
use serde::{Serialize, de::DeserializeOwned};

fn unavailable() -> CloudError {
    CloudError::new(
        "PROVIDER_CREDENTIALS_UNAVAILABLE",
        "Die geschützte Cloud-Anmeldung ist nicht verfügbar.",
    )
}
fn key() -> CloudResult<aead::LessSafeKey> {
    let value = std::env::var("MACRO_PROVIDER_KEY").map_err(|_| unavailable())?;
    let bytes = STANDARD.decode(value).map_err(|_| unavailable())?;
    if bytes.len() != 32 {
        return Err(unavailable());
    }
    Ok(aead::LessSafeKey::new(
        aead::UnboundKey::new(&aead::CHACHA20_POLY1305, &bytes).map_err(|_| unavailable())?,
    ))
}
pub fn available() -> bool {
    key().is_ok()
}
pub fn seal<T: Serialize>(scope: &str, value: &T) -> CloudResult<String> {
    seal_with(&key()?, scope, value)
}
fn seal_with<T: Serialize>(key: &aead::LessSafeKey, scope: &str, value: &T) -> CloudResult<String> {
    let mut bytes = serde_json::to_vec(value)?;
    let mut nonce = [0u8; 12];
    SystemRandom::new()
        .fill(&mut nonce)
        .map_err(|_| unavailable())?;
    key.seal_in_place_append_tag(
        aead::Nonce::assume_unique_for_key(nonce),
        aead::Aad::from(scope.as_bytes()),
        &mut bytes,
    )
    .map_err(|_| unavailable())?;
    let mut envelope = vec![1u8];
    envelope.extend_from_slice(&nonce);
    envelope.extend(bytes);
    Ok(STANDARD.encode(envelope))
}
pub fn open<T: DeserializeOwned>(scope: &str, value: &str) -> CloudResult<T> {
    open_with(&key()?, scope, value)
}
fn open_with<T: DeserializeOwned>(
    key: &aead::LessSafeKey,
    scope: &str,
    value: &str,
) -> CloudResult<T> {
    if value.len() > 1_048_576 {
        return Err(unavailable());
    }
    let envelope = STANDARD.decode(value).map_err(|_| unavailable())?;
    if envelope.len() < 30 || envelope[0] != 1 {
        return Err(unavailable());
    }
    let nonce: [u8; 12] = envelope[1..13].try_into().map_err(|_| unavailable())?;
    let mut data = envelope[13..].to_vec();
    let plain = key
        .open_in_place(
            aead::Nonce::assume_unique_for_key(nonce),
            aead::Aad::from(scope.as_bytes()),
            &mut data,
        )
        .map_err(|_| unavailable())?;
    serde_json::from_slice(plain).map_err(|_| unavailable())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};
    #[test]
    fn credentials_require_the_correct_key_workspace_account_and_unchanged_ciphertext() {
        let make = |byte| {
            aead::LessSafeKey::new(
                aead::UnboundKey::new(&aead::CHACHA20_POLY1305, &[byte; 32]).unwrap(),
            )
        };
        let key = make(7);
        let value = json!({"email":"synthetic@example.test","password":"synthetic-password"});
        let cipher = seal_with(&key, "workspace-a/account-a", &value).unwrap();
        assert_eq!(
            open_with::<Value>(&key, "workspace-a/account-a", &cipher).unwrap(),
            value
        );
        assert_ne!(
            cipher,
            seal_with(&key, "workspace-a/account-a", &value).unwrap()
        );
        assert!(!String::from_utf8_lossy(&STANDARD.decode(&cipher).unwrap()).contains("synthetic"));
        assert!(open_with::<Value>(&make(8), "workspace-a/account-a", &cipher).is_err());
        for scope in ["workspace-b/account-a", "workspace-a/account-b"] {
            assert!(open_with::<Value>(&key, scope, &cipher).is_err());
        }
        let mut bytes = STANDARD.decode(&cipher).unwrap();
        let last = bytes.len() - 1;
        bytes[last] ^= 1;
        assert!(
            open_with::<Value>(&key, "workspace-a/account-a", &STANDARD.encode(bytes)).is_err()
        );
        for invalid in ["", "not-base64", &cipher[..20]] {
            assert!(open_with::<Value>(&key, "workspace-a/account-a", invalid).is_err());
        }
    }
}
