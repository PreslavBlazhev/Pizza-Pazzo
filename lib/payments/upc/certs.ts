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
/**
 * UPC's PUBLIC gateway certificate for PRODUCTION ("work-server") — not a
 * secret, and NEVER a default: production names its certificate explicitly
 * (UPC_GATEWAY_CERT). Kept here so the configuration check can tell the two
 * certificates apart and refuse a test certificate in production (and the
 * production one in the sandbox).
 *
 * Published by UPC on "Production Certificate"
 * (docsecom.atlassian.net/wiki/spaces/DOCEN/pages/49971882, v8), downloaded
 * 30.10.2026; "Data Signature" and "NOTIFY_URL" link it as the certificate
 * for the working environment.
 *
 *   subject  C=UA, ST=Kyiv, L=Kyiv, O=UPC, OU=E-Commerce Dept., CN=server
 *   key      RSA 1024 bit; certificate sha1WithRSA, valid 2005-08-03 … 2008-05-23
 *   SHA-256  00:D5:B5:3A:1A:0E:0B:C0:54:8A:18:13:91:96:1F:68:AA:71:31:5E:FB:FC:B6:55:1C:7C:5F:8E:3D:F7:5B:A4
 *
 * Probe 30.10.2026 (one signed JSON status query for a non-existent OrderID
 * on https://secure.kbcbank.bg/kbc/service/01, MID 7331057, no transaction):
 * answer {"alg":"RS512"}, {"results":[],"TranCode":"291",…}; the signature
 * verifies with THIS certificate and SHA-512 only (not with the test one).
 * Which key and hash sign production NOTIFY messages is asked of ОББ.
 */
export const UPC_PRODUCTION_GATEWAY_CERT = `-----BEGIN CERTIFICATE-----
MIICfTCCAeYCAQkwDQYJKoZIhvcNAQEFBQAwgYgxCzAJBgNVBAYTAlVBMQ0wCwYD
VQQIEwRLWUlWMQ0wCwYDVQQHEwRLWUlWMQwwCgYDVQQKEwNVUEMxEzARBgNVBAsT
CkUtQ09NTUVSQ0UxGTAXBgNVBAMTEFVQQy5FQ09NTUVSQ0UuQ0ExHTAbBgkqhkiG
9w0BCQEWDmVjLmhlbHBAdXBjLnVhMB4XDTA1MDgwMzEzNTk0MFoXDTA4MDUyMzEz
NTk0MFowgYQxCzAJBgNVBAYTAlVBMQ0wCwYDVQQIEwRLeWl2MQ0wCwYDVQQHEwRL
eWl2MQwwCgYDVQQKEwNVUEMxGTAXBgNVBAsTEEUtQ29tbWVyY2UgRGVwdC4xDzAN
BgNVBAMTBnNlcnZlcjEdMBsGCSqGSIb3DQEJARYOZWMuaGVscEB1cGMudWEwgZ8w
DQYJKoZIhvcNAQEBBQADgY0AMIGJAoGBANNcize8kS8kbIb3mV9tT54S3LaseLlb
hsnMlxVwVK3Zvpnug/OAn7H0dd3z0QKH9KbX/LXpC2I0uf6TJcpRkkp9XBedIwhS
OvAFqqvCam5K7EgpLQhm2WN7CU8G/yeHypRxk2zyR8djpHQJOGlyMqcccn0CeFos
jUUu3Ju/e9bnAgMBAAEwDQYJKoZIhvcNAQEFBQADgYEACanXJ0K2838tRW49JloN
NrLFR3GWFJTevs3H952TM7TN2neuEAYAB9XQ2Gk9MBrHgw4Wc2A89VK1M8rd7Mzo
Qvz3ABE7+zRa2r/Fgg0wO2I9ixEqjBw5Q2PNrzEwqe810Mz8CPCbvOQd/eH4BDm6
J2vxcUsUDwW7zXITB4mdW6I=
-----END CERTIFICATE-----`;

/** SHA-256 of the DER above. */
export const UPC_PRODUCTION_GATEWAY_CERT_SHA256 =
  "00:D5:B5:3A:1A:0E:0B:C0:54:8A:18:13:91:96:1F:68:AA:71:31:5E:FB:FC:B6:55:1C:7C:5F:8E:3D:F7:5B:A4";
