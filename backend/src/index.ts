import express from 'express';
import cors from 'cors';
import * as forge from 'node-forge';
import jwt from 'jsonwebtoken';
import { initStorage, getIndex, saveToIndex, updateInIndex, deleteFromIndex, saveFile, deleteFile, readFile, readFileBuffer, CertMetadata } from './storage';
import { generateCA, generateIntermediateCA, generateCert, exportToPkcs12, CertConfig } from './pki';

const app = express();
const port = process.env.PORT || 3001;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_jwt_key';
const API_KEY = process.env.API_KEY || 'my-secret-api-key';

app.use(cors());
app.use(express.json());

initStorage();

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token });
  }
  res.status(401).json({ error: 'Invalid password' });
});

// Authentication Middleware
const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path === '/api/login' || req.path === '/api/status') return next();

  // Allow Direct API Key Access
  const apiKeyHeader = req.header('X-API-Key');
  if (API_KEY && apiKeyHeader === API_KEY) {
    return next();
  }

  // Check JWT (Header or Query parameter for downloads)
  let token = req.header('Authorization')?.split(' ')[1];
  if (!token && req.query.token) {
    token = req.query.token as string;
  }

  if (token) {
    try {
      jwt.verify(token, JWT_SECRET);
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  res.status(401).json({ error: 'Authentication required' });
};

app.use(authMiddleware);

app.get('/api/status', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/certs', (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 0; // 0 means all
  const type = req.query.type as string;

  let index = getIndex();
  
  if (type) {
    index = index.filter(c => c.type === type);
  }

  // Sort by issuedAt descending (newest first)
  index.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());

  const total = index.length;
  
  if (limit > 0) {
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    index = index.slice(startIndex, endIndex);
  }

  res.json({
    data: index,
    total
  });
});

app.get('/api/certs/:serial', (req, res) => {
  try {
    const index = getIndex();
    const cert = index.find(m => m.serial === req.params.serial);
    if (!cert) return res.status(404).json({ error: 'Not found' });

    const subDir = cert.type === 'ca' ? 'ca' : 'certs';
    const pem = readFile(subDir, `${cert.serial}.crt`);
    
    let issuer = 'Unknown';
    try {
      const forgeCert = forge.pki.certificateFromPem(pem);
      const issuerAttr = forgeCert.issuer.attributes.find(a => a.name === 'commonName' || a.shortName === 'CN');
      issuer = issuerAttr && issuerAttr.value ? String(issuerAttr.value) : 'Unknown';
    } catch (e) {
      console.error('Failed to parse cert PEM', e);
    }
    
    res.json({ ...cert, pem, issuer });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/certs/:serial', (req, res) => {
  try {
    const index = getIndex();
    const cert = index.find(m => m.serial === req.params.serial);
    if (!cert) return res.status(404).json({ error: 'Not found' });

    deleteFromIndex(req.params.serial);

    const subDir = cert.type === 'ca' ? 'ca' : 'certs';
    const keySubDir = cert.type === 'ca' ? 'ca' : 'keys';

    deleteFile(subDir, `${cert.serial}.crt`);
    deleteFile(keySubDir, `${cert.serial}.key`);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ca/import', (req, res) => {
  try {
    const { commonName, certPem, keyPem } = req.body;
    if (!commonName || !certPem || !keyPem) {
      throw new Error('commonName, certPem, and keyPem are all required');
    }

    // Basic validation: try to parse the cert to get the serial
    const cert = forge.pki.certificateFromPem(certPem);
    const serial = cert.serialNumber;

    saveFile('ca', `${serial}.crt`, certPem);
    saveFile('ca', `${serial}.key`, keyPem);

    const meta: CertMetadata = {
      serial,
      commonName,
      type: 'ca',
      issuedAt: cert.validity.notBefore.toISOString(),
      expiresAt: cert.validity.notAfter.toISOString(),
      status: 'active'
    };
    saveToIndex(meta);

    res.json(meta);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ca', (req, res) => {
  try {
    const config: CertConfig = {
      commonName: req.body.commonName,
      emailAddress: req.body.emailAddress,
      organization: req.body.organization || 'My CA',
      organizationalUnit: req.body.organizationalUnit,
      country: req.body.country || 'US',
      state: req.body.state,
      locality: req.body.locality,
      validityDays: req.body.validityDays || 3650,
      keySize: req.body.keySize || 4096
    };
    
    let certPem, privateKeyPem, serial;
    const parentCaSerial = req.body.parentCaSerial;

    if (parentCaSerial) {
      const caCertPem = readFile('ca', `${parentCaSerial}.crt`);
      const caKeyPem = readFile('ca', `${parentCaSerial}.key`);
      const result = generateIntermediateCA(caCertPem, caKeyPem, config);
      certPem = result.certPem;
      privateKeyPem = result.privateKeyPem;
      serial = result.serial;
    } else {
      const result = generateCA(config);
      certPem = result.certPem;
      privateKeyPem = result.privateKeyPem;
      serial = result.serial;
    }

    saveFile('ca', `${serial}.crt`, certPem);
    saveFile('ca', `${serial}.key`, privateKeyPem);
const meta: CertMetadata = {
  serial,
  type: 'ca',
  caSerial: parentCaSerial || undefined,
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + config.validityDays * 24 * 60 * 60 * 1000).toISOString(),
  status: 'active',
  ...config
};
    saveToIndex(meta);

    res.json(meta);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/certs', (req, res) => {
  try {
    const { caSerial, ...body } = req.body;
    if (!caSerial) throw new Error('caSerial is required');

    const config: CertConfig = {
      commonName: body.commonName,
      emailAddress: body.emailAddress,
      organization: body.organization,
      organizationalUnit: body.organizationalUnit,
      country: body.country,
      state: body.state,
      locality: body.locality,
      validityDays: body.validityDays || 365,
      keySize: body.keySize || 2048,
      isClient: !!body.isClient,
      sans: body.sans || []
    };

    const caCertPem = readFile('ca', `${caSerial}.crt`);
    const caKeyPem = readFile('ca', `${caSerial}.key`);

    const { certPem, privateKeyPem, serial } = generateCert(caCertPem, caKeyPem, config);

    saveFile('certs', `${serial}.crt`, certPem);
    saveFile('keys', `${serial}.key`, privateKeyPem);
const meta: CertMetadata = {
  serial,
  type: config.isClient ? 'client' : 'server',
  caSerial,
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + config.validityDays * 24 * 60 * 60 * 1000).toISOString(),
  status: 'active',
  ...config
};
    saveToIndex(meta);

    res.json(meta);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/certs/:serial/revoke', (req, res) => {
  try {
    updateInIndex(req.params.serial, { status: 'revoked' });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/download/:serial/:format', (req, res) => {
  const { serial, format } = req.params;
  const index = getIndex();
  const cert = index.find(m => m.serial === serial);

  if (!cert) return res.status(404).send('Not found');

  try {
    if (format === 'crt') {
      const subDir = cert.type === 'ca' ? 'ca' : 'certs';
      res.setHeader('Content-Type', 'application/x-x509-ca-cert');
      res.setHeader('Content-Disposition', `attachment; filename="${cert.commonName.replace(/[^a-z0-9]/gi, '_')}.crt"`);
      res.send(readFile(subDir, `${serial}.crt`));
    } else if (format === 'key') {
      const subDir = cert.type === 'ca' ? 'ca' : 'keys';
      res.setHeader('Content-Type', 'application/x-pem-file');
      res.setHeader('Content-Disposition', `attachment; filename="${cert.commonName.replace(/[^a-z0-9]/gi, '_')}.key"`);
      res.send(readFile(subDir, `${serial}.key`));
    } else {
      res.status(400).send('Invalid format');
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/download/:serial/p12', (req, res) => {
  const { serial } = req.params;
  const { password } = req.body;
  const index = getIndex();
  const cert = index.find(m => m.serial === serial);

  if (!cert) return res.status(404).json({ error: 'Not found' });
  if (!password) return res.status(400).json({ error: 'Password is required' });

  try {
    if (cert.type === 'ca') return res.status(400).json({ error: 'Cannot export CA as P12' });
    const caCertPem = readFile('ca', `${cert.caSerial}.crt`);
    const certPem = readFile('certs', `${serial}.crt`);
    const keyPem = readFile('keys', `${serial}.key`);
    
    const p12Buffer = exportToPkcs12(certPem, keyPem, caCertPem, password);
    res.setHeader('Content-Type', 'application/x-pkcs12');
    res.setHeader('Content-Disposition', `attachment; filename="${cert.commonName.replace(/[^a-z0-9]/gi, '_')}.p12"`);
    res.send(p12Buffer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Backend listening at http://localhost:${port}`);
});

