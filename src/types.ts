export interface StateEntryInterface {
  claudeCodeChallenge: string
  claudeCodeChallengeMethod: string
  claudeRedirectUri: string
  brokerCodeVerifier: string
  expiresAt: number
}

export interface EntraTokenResponseInterface {
  access_token: string
  token_type: string
  expires_in: number
  scope: string
  id_token?: string
}

export interface EntraTokenClaimsInterface {
  oid: string
  preferred_username?: string
  upn?: string
  groups?: string[]
  exp: number
  iss: string
  aud: string | string[]
  appid?: string
  azp?: string
}

export interface JwksKeyInterface {
  kid: string
  kty: string
  use: string
  n: string
  e: string
  x5c?: string[]
}

export interface JwksCacheInterface {
  keys: JwksKeyInterface[]
  fetchedAt: number
}
