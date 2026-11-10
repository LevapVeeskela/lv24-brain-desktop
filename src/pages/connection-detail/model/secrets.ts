/** Fold a secret name exactly like the engine secret store's NormalizeKey. */
export function normalizeSecretName(name: string): string {
  return name.toUpperCase().replace(/[._/-]/g, "_");
}

/**
 * Build the normalized keychain name for `conn/<id>/<field>`.
 *
 * `NormalizeKey` uppercases the name and folds '.', '_', '/' and '-' into
 * underscores before the value reaches the OS keychain.
 */
export function credentialSecretName(
  connectionId: string,
  field: string,
): string {
  return normalizeSecretName(`conn/${connectionId}/${field}`);
}

/** OAuth token bundle written by `connection auth` (conn/<id>/oauth). */
export function oauthSessionSecretName(connectionId: string): string {
  return credentialSecretName(connectionId, "oauth");
}

/** OAuth session metadata written next to the bundle (conn/<id>/oauthmeta). */
export function oauthMetadataSecretName(connectionId: string): string {
  return credentialSecretName(connectionId, "oauthmeta");
}

/**
 * Whether the keychain holds a complete OAuth session for the connection.
 *
 * The engine's `SessionStore.Load` requires both `conn/<id>/oauth` (the token
 * bundle) and `conn/<id>/oauthmeta` (the session metadata) and reports no
 * session when either is missing, so a partial pair is not a usable session.
 */
export function hasStoredOAuthSession(
  storedSecrets: ReadonlySet<string>,
  connectionId: string,
): boolean {
  return (
    storedSecrets.has(oauthSessionSecretName(connectionId)) &&
    storedSecrets.has(oauthMetadataSecretName(connectionId))
  );
}

/**
 * Whether a descriptor's secret field is satisfied by the keychain.
 *
 * The engine's OAuth credential provider substitutes the `token` field with
 * the stored OAuth access token, so an authorized OAuth session is a stored
 * value for that field even though `conn/<id>/token` does not exist.
 */
export function isCredentialStored(
  storedSecrets: ReadonlySet<string>,
  connectionId: string,
  field: string,
  oauthEnabled: boolean,
): boolean {
  if (storedSecrets.has(credentialSecretName(connectionId, field))) {
    return true;
  }
  return (
    oauthEnabled &&
    field === "token" &&
    hasStoredOAuthSession(storedSecrets, connectionId)
  );
}
