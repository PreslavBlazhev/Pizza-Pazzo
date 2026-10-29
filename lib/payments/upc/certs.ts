/**
 * UPC's PUBLIC gateway certificate for the TEST environment — not a secret.
 *
 * Published by UPC on "Test-server certificate"
 * (docsecom.atlassian.net/wiki/spaces/DOCEN/pages/49971876), downloaded
 * 29.10.2026. UPC states the test environment is the same for all countries,
 * so this is the key that signs NOTIFY messages and browser returns of the
 * KBC/ОББ sandbox too — to be CONFIRMED by ОББ (docs/UBB-UPC-INTEGRATION.md,
 * open question Q3). UPC_GATEWAY_CERT overrides it.
 *
 *   subject  C=UA, ST=Some-State, L=Kyiv, O=UPC, OU=eCommerce Unit, CN=Signature
 *   key      RSA 1024 bit; certificate sha1WithRSA, valid 2006-03-14 … 2009-01-01
 *   SHA-256  34:B6:1E:9C:2A:C9:C4:2C:06:C4:D9:FF:32:58:2D:16:3B:72:DE:53:84:91:FF:6A:23:A1:1F:DC:8D:28:39:D8
 *
 * The expiry and the weak certificate signature do not matter here: the
 * certificate is only a container for UPC's public key, which is pinned
 * (see loadPublicKey). The PRODUCTION certificate is never defaulted —
 * production must name it explicitly.
 */
export const UPC_TEST_GATEWAY_CERT = `-----BEGIN CERTIFICATE-----
MIIChDCCAe0CASowDQYJKoZIhvcNAQEFBQAwgYgxCzAJBgNVBAYTAlVBMQ0wCwYD
VQQIEwRLWUlWMQ0wCwYDVQQHEwRLWUlWMQwwCgYDVQQKEwNVUEMxEzARBgNVBAsT
CkUtQ09NTUVSQ0UxGTAXBgNVBAMTEFVQQy5FQ09NTUVSQ0UuQ0ExHTAbBgkqhkiG
9w0BCQEWDmVjLmhlbHBAdXBjLnVhMB4XDTA2MDMxNDE0MDIxNVoXDTA5MDEwMTE0
MDIxNVowgYsxCzAJBgNVBAYTAlVBMRMwEQYDVQQIEwpTb21lLVN0YXRlMQ0wCwYD
VQQHEwRLeWl2MQwwCgYDVQQKEwNVUEMxFzAVBgNVBAsTDmVDb21tZXJjZSBVbml0
MRIwEAYDVQQDEwlTaWduYXR1cmUxHTAbBgkqhkiG9w0BCQEWDmVjLmhlbHBAdXBj
LnVhMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCzIoeW9btImJ1X/u1DofZY
1lGEAdDqmBKljFIlARpwyNjUb70RkZPzq1TB3SuNNJQ+1Wms2sKGu5uozoy9a2AR
rJOsR+QJSwEcQo/th+NhhTTBNh/rPshlCX6R2Hm1yoMTvTrloxAXpDtgkeyMQdBe
SZ991wX/EhX0zMaRG2dDSQIDAQABMA0GCSqGSIb3DQEBBQUAA4GBAMwpbjWXzoNQ
wQcxAYaoL7uFhNDub8QnCJJjC3HvGz2Kz250hyWc3KVRSEGQ4l9sNZl1PrHUg6OP
i4dPF01D5Nd36YIcMj5wsu3L4J77NvuLAj36ZZTPTsp0UmFdPaBa99GaeZgyfRxB
NNNZ4iNswLcXmGStimAC/32TO4SsPn91
-----END CERTIFICATE-----`;

/** SHA-256 of the DER above, for the admin screen and the docs. */
export const UPC_TEST_GATEWAY_CERT_SHA256 =
  "34:B6:1E:9C:2A:C9:C4:2C:06:C4:D9:FF:32:58:2D:16:3B:72:DE:53:84:91:FF:6A:23:A1:1F:DC:8D:28:39:D8";
