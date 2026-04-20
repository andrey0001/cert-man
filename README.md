# CertManager (PKI Web Interface)

CertManager is a lightweight, Dockerized web application for managing your own Public Key Infrastructure (PKI). It allows you to easily create, manage, and distribute Certificate Authorities (CAs), server certificates, and client certificates (for mTLS) through a modern UI or directly via API.

## 🚀 Key Features

- **Certificate Authority Management**: Create Self-Signed Root CAs or Intermediate CAs. Import external CAs.
- **Certificate Generation**: Issue TLS/SSL Server certificates and Client certificates with custom Subject Alternative Names (SANs) and validity periods.
- **Certificate Lifecycle**: View details (including Issuer), revoke, or permanently delete certificates.
- **Export Options**: Download certificates in `.crt`, `.key`, or `.p12` (PKCS#12) formats.
- **Security**: 
  - Web UI secured by JWT (JSON Web Tokens).
  - API endpoints secured by API Key.
  - Docker containers run as a secure, non-root user (`node`).
- **Modern UI**: React-based frontend with pagination, filtering, and responsive design.

## 🛠 Tech Stack

- **Frontend**: React, TypeScript, Vite, Nginx.
- **Backend**: Node.js, Express, TypeScript, `node-forge` (for PKI/Cryptography).
- **Deployment**: Docker & Docker Compose.

---

## 🏃 Quick Start

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

### 1. Clone the repository
```bash
git clone <your-repository-url>
cd cert-man
```

### 2. Configure Environment (Optional)
You can edit the `docker-compose.yml` file to change the default passwords and secrets:

| Variable | Default Value | Description |
|----------|---------------|-------------|
| `ADMIN_PASSWORD` | `admin` | Password to access the Web UI. |
| `JWT_SECRET` | `supersecret_jwt_key` | Secret used to sign session tokens. |
| `API_KEY` | `my-secret-api-key` | Key used for direct backend API access. |
| `BACKEND_URI` | `http://backend:3001` | Internal Docker DNS routing for Nginx. |

### 3. Build and Run
Start the application in detached mode:
```bash
docker compose up --build -d
```

### 4. Access the UI
Open your browser and navigate to:
**http://localhost:3000**

Log in using the `ADMIN_PASSWORD` (default is `admin`).

---

## 📖 Usage Guide

1. **Create a Root CA**: Click `+ New CA`, leave the "Parent CA" dropdown empty, and fill in the details.
2. **Create an Intermediate CA**: Click `+ New CA`, select your existing Root CA from the "Parent CA" dropdown.
3. **Issue a Certificate**: Click `+ New Certificate`, select the CA that will sign it, choose "Server" or "Client", and specify the Common Name (CN) and SANs (e.g., `example.com, 192.168.1.5`).
4. **Download**: Click the `CRT`, `KEY`, or `P12` buttons next to the certificate to download the generated files.

---

## 🤖 API Access

The backend provides a RESTful API that can be used for automation (e.g., automatically requesting certs from a CI/CD pipeline).

For detailed API documentation and `curl` examples, please see the [API.md](./API.md) file.

---

## 💾 Data Persistence

All generated certificates, private keys, and the JSON database index are stored in a Docker Volume named `cert-data`.
- Path inside container: `/app/data`
- To backup your certificates, you can backup the contents of this Docker volume.

If you want to mount a local folder instead of a Docker volume, modify your `docker-compose.yml`:
```yaml
    volumes:
      - ./my-local-certs-folder:/app/data
```

---

## 🛡️ Security Notes

- The backend Docker container utilizes a multi-stage build and runs as the unprivileged `node` user to mitigate potential container escape vulnerabilities.
- **Production Use**: If exposing this service to the internet, it is highly recommended to place it behind a Reverse Proxy (like Traefik or Nginx Proxy Manager) to provide HTTPS for the UI.
- Private keys are stored in plaintext inside the Docker volume (`/app/data/keys`). Ensure your host machine's file system is secure.