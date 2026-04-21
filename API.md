# CertManager API Documentation

This document describes how to interact directly with the CertManager backend API. 

## Base URL
By default, the backend runs on port `3001`. 
**Base URL:** `http://localhost:3001`

## Authentication

To bypass the JWT login system and script actions directly, you must use an API key. 
By default, the API key is configured in `docker-compose.yml` as `API_KEY=my-secret-api-key`.

You must include this key in the headers of every request (except `/api/status` and `/api/login`):
**Header:** `X-API-Key: my-secret-api-key`

---

## Endpoints Overview

### 1. Check API Status
Check if the API is running. (No authentication required)
```bash
curl http://localhost:3001/api/status
```

### 2. List Certificates
Get a paginated list of all certificates.
- **Query Parameters:** `page` (default: 1), `limit` (default: 0 = all), `type` (optional: 'ca', 'server', 'client')

```bash
curl -H "X-API-Key: my-secret-api-key" \
     "http://localhost:3001/api/certs?limit=10&page=1"
```

### 3. Get Certificate Details
Get the details of a specific certificate, including its PEM string.
```bash
curl -H "X-API-Key: my-secret-api-key" \
     http://localhost:3001/api/certs/<SERIAL_NUMBER>
```

### 4. Create a Certificate Authority (CA)
Create a new Root CA or Intermediate CA.
- To create a Root CA, omit `parentCaSerial`.
- To create an Intermediate CA, provide the `parentCaSerial` of the signing Root CA.

```bash
curl -X POST -H "Content-Type: application/json" \
     -H "X-API-Key: my-secret-api-key" \
     -d '{
           "commonName": "My Automation Root CA",
           "organization": "My Company",
           "country": "US",
           "validityDays": 3650,
           "keySize": 4096
         }' \
     http://localhost:3001/api/ca
```

### 5. Create a Server or Client Certificate
Generate a new certificate signed by an existing CA.
- **Required:** `caSerial` (The serial of the CA that will sign this cert), `commonName`.
- **Optional:** `isClient` (boolean, set to true for mTLS client certs), `sans` (array of strings for Subject Alternative Names like IPs and Domains).

```bash
curl -X POST -H "Content-Type: application/json" \
     -H "X-API-Key: my-secret-api-key" \
     -d '{
           "caSerial": "<CA_SERIAL_NUMBER>",
           "commonName": "api.example.com",
           "isClient": false,
           "validityDays": 365,
           "sans": ["api.example.com", "10.0.0.5"]
         }' \
     http://localhost:3001/api/certs
```

### 6. Download Certificate Files
Download the actual `.crt`, `.key`, or `.p12` files.

#### Download CRT or Key (GET)
```bash
# Download the CRT
curl -H "X-API-Key: my-secret-api-key" \
     -o certificate.crt \
     http://localhost:3001/api/download/<SERIAL_NUMBER>/crt

# Download the Private Key
curl -H "X-API-Key: my-secret-api-key" \
     -o private.key \
     http://localhost:3001/api/download/<SERIAL_NUMBER>/key
```

#### Download P12 Archive (POST)
To download a PKCS#12 archive, you must provide an encryption password in the request body.
```bash
# Download P12
curl -X POST -H "Content-Type: application/json" \
     -H "X-API-Key: my-secret-api-key" \
     -d '{"password": "my_secure_password", "algorithm": "aes256"}' \
     -o bundle.p12 \
     http://localhost:3001/api/download/<SERIAL_NUMBER>/p12
```

Note: `algorithm` can be `aes256` (default) or `3des` (legacy).

### 7. Revoke a Certificate
Marks a certificate as revoked in the database.

```bash
curl -X POST -H "X-API-Key: my-secret-api-key" \
     http://localhost:3001/api/certs/<SERIAL_NUMBER>/revoke
```

### 8. Delete a Certificate
Permanently deletes the certificate, its keys, and removes it from the index. **This cannot be undone.**

```bash
curl -X DELETE -H "X-API-Key: my-secret-api-key" \
     http://localhost:3001/api/certs/<SERIAL_NUMBER>
```

### 9. Download Certificate Revocation List (CRL)
Get the latest CRL for a specific Certificate Authority. (No authentication required, as CRLs are publicly available to allow clients to verify certificate status).

```bash
curl -o revoked.crl http://localhost:3001/api/ca/<CA_SERIAL_NUMBER>/crl
```
